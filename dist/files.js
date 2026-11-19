const enc = new TextEncoder();
const dec = new TextDecoder();
const xml = value => String(value ?? '').replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]));
const safeCell = value => typeof value === 'string' && /^(?:[\t\r\n]|[\s\p{Cf}\p{Cc}]*[=+\-@])/u.test(value.normalize('NFKC')) ? "'"+value : value;
export function readCsv(source) {
  const text = source.replace(/^\uFEFF/,'');
  const first = text.split(/\r?\n/,1)[0];
  const delimiter = first.includes('\t') ? '\t' : first.includes(';') && !first.includes(',') ? ';' : ',';
  const rows=[];
  let row=[], field='', quoted=false;
  for (let i=0;i<text.length;i++) {
    const char=text[i];
    if (char==='"') {
      if (quoted && text[i+1]==='"') { field+='"'; i++; }
      else if (quoted || field==='') quoted=!quoted;
      else field+=char;
    } else if (!quoted && char===delimiter) {
      row.push(field);
      field='';
    } else if (!quoted && (char==='\n'||char==='\r')) {
      if (char==='\r' && text[i+1]==='\n') i++;
      rows.push([...row,field]);
      row=[];
      field='';
    } else field+=char;
  }
  if (quoted) throw Error('A quoted CSV field is missing its closing quote.');
  if (row.length||field) rows.push([...row,field]);
  return rows;
}
const crcTable=Array.from({length:256},(_,index)=>{
  let crc=index;
  for(let bit=0;bit<8;bit++) crc=crc&1 ? 0xedb88320^(crc>>>1) : crc>>>1;
  return crc;
});
function crc32(data) {
  let crc=0xffffffff;
  for(const byte of data) crc=crcTable[(crc^byte)&255]^(crc>>>8);
  return (crc^0xffffffff)>>>0;
}
const bytes = size => {
  const data=new Uint8Array(size);
  const view=new DataView(data.buffer);
  return {data,u16:(offset,n)=>view.setUint16(offset,n,true),u32:(offset,n)=>view.setUint32(offset,n,true)};
};
function zip(files) {
  const body=[], central=[];
  let offset=0, centralSize=0;
  for(const [path,source] of Object.entries(files)) {
    const name=enc.encode(path), data=enc.encode(source), crc=crc32(data);
    const local=bytes(30), entry=bytes(46);
    local.u32(0,0x04034b50); local.u16(4,20); local.u16(12,33); local.u32(14,crc); local.u32(18,data.length); local.u32(22,data.length); local.u16(26,name.length);
    entry.u32(0,0x02014b50); entry.u16(4,20); entry.u16(6,20); entry.u16(14,33); entry.u32(16,crc); entry.u32(20,data.length); entry.u32(24,data.length); entry.u16(28,name.length); entry.u32(42,offset);
    body.push(local.data,name,data);
    central.push(entry.data,name);
    offset+=30+name.length+data.length;
    centralSize+=46+name.length;
  }
  const end=bytes(22), count=Object.keys(files).length;
  end.u32(0,0x06054b50); end.u16(8,count); end.u16(10,count); end.u32(12,centralSize); end.u32(16,offset);
  return new Blob([...body,...central,end.data],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
async function unzipXml(buffer) {
  const v=new DataView(buffer);
  let end=v.byteLength-22;
  while(end>=Math.max(0,v.byteLength-65557) && v.getUint32(end,true)!==0x06054b50) end--;
  if(end<0 || v.getUint32(end,true)!==0x06054b50) throw Error('This file is not a valid Excel workbook.');
  let ptr=v.getUint32(end+16,true);
  const directoryStart=ptr;
  const directoryEnd=ptr+v.getUint32(end+12,true);
  if(directoryEnd>end) throw Error('The workbook directory could not be read.');
  const files=Object.create(null);
  const count=v.getUint16(end+10,true);
  let totalExpanded=0;
  for(let i=0;i<count;i++) {
    if(ptr+46>directoryEnd||v.getUint32(ptr,true)!==0x02014b50) throw Error('The workbook directory could not be read.');
    const flags=v.getUint16(ptr+8,true);
    const method=v.getUint16(ptr+10,true), size=v.getUint32(ptr+20,true), expanded=v.getUint32(ptr+24,true);
    const nameLen=v.getUint16(ptr+28,true), extra=v.getUint16(ptr+30,true), comment=v.getUint16(ptr+32,true);
    const next=ptr+46+nameLen+extra+comment;
    if(next>directoryEnd) throw Error('The workbook directory could not be read.');
    const name=dec.decode(new Uint8Array(buffer,ptr+46,nameLen));
    const location=v.getUint32(ptr+42,true);
    ptr=next;
    if(!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(name)) continue;
    if(flags&1) throw Error('Choose a workbook without password protection.');
    totalExpanded+=expanded;
    if(expanded>30_000_000||totalExpanded>60_000_000) throw Error('This workbook is too large to import.');
    if(Object.hasOwn(files,name)||location+30>directoryStart||v.getUint32(location,true)!==0x04034b50) throw Error('The workbook sheet could not be read.');
    const start=location+30+v.getUint16(location+26,true)+v.getUint16(location+28,true);
    if(start+size>directoryStart) throw Error('The workbook sheet could not be read.');
    const compressed=new Uint8Array(buffer,start,size);
    if(method===0&&size===expanded) files[name]=dec.decode(compressed);
    else if(method===8) files[name]=await inflateXml(compressed,expanded);
    else throw Error('The workbook sheet could not be read. Save the file as CSV and retry.');
  }
  return files;
}

async function inflateXml(compressed,expanded) {
  const reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const decoder=new TextDecoder();
  const parts=[];
  let size=0;
  try {
    for(let chunk=await reader.read();!chunk.done;chunk=await reader.read()) {
      size+=chunk.value.byteLength;
      if(size>expanded) throw Error('The workbook sheet does not match its declared size.');
      parts.push(decoder.decode(chunk.value,{stream:true}));
    }
    if(size!==expanded) throw Error('The workbook sheet does not match its declared size.');
    parts.push(decoder.decode());
    return parts.join('');
  } finally {
    await reader.cancel().catch(()=>{});
    reader.releaseLock();
  }
}

function parseXml(source) {
  if(/<!DOCTYPE\b/i.test(source)) throw Error('The workbook contains an unsupported XML declaration.');
  const doc=new DOMParser().parseFromString(source,'application/xml');
  if(doc.querySelector('parsererror')) throw Error('The sheet contains unreadable XML.');
  return doc;
}
const nodes=(element,tag)=>Array.from(element.getElementsByTagNameNS('*',tag));
const textNodes=element=>nodes(element,'t').map(node=>node.textContent).join('');
const lettersToIndex=letters=>[...letters].reduce((n,char)=>n*26+char.charCodeAt(0)-64,0)-1;
function columnName(index) {
  let name='';
  for(let n=index+1;n>0;n=Math.floor((n-1)/26)) name=String.fromCharCode(65+(n-1)%26)+name;
  return name;
}
export async function readTable(file) {
  if (/\.(csv|tsv)$/i.test(file.name)) return readCsv(await file.text());
  if (!/\.xlsx$/i.test(file.name)) throw Error('Choose a CSV or Excel .xlsx file.');
  const files=await unzipXml(await file.arrayBuffer());
  const shared=files['xl/sharedStrings.xml']?nodes(parseXml(files['xl/sharedStrings.xml']),'si').map(textNodes):[];
  let path=Object.keys(files).find(name=>name.startsWith('xl/worksheets/'));
  if(files['xl/workbook.xml'] && files['xl/_rels/workbook.xml.rels']) {
    const sheet=nodes(parseXml(files['xl/workbook.xml']),'sheet')[0];
    const rel=sheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id') || sheet?.getAttribute('r:id');
    const target=nodes(parseXml(files['xl/_rels/workbook.xml.rels']),'Relationship').find(node=>node.getAttribute('Id')===rel)?.getAttribute('Target');
    if(target) path=target.startsWith('/') ? target.slice(1) : 'xl/'+target;
  }
  if(!files[path]) throw Error('No worksheet could be read.');
  return nodes(parseXml(files[path]),'row').map(element=>{
    const row=[];
    for(const cell of nodes(element,'c')) {
      const address=cell.getAttribute('r');
      const match=address&&/^([A-Z]{1,3})[1-9]\d{0,6}$/.exec(address);
      const index=match ? lettersToIndex(match[1]) : row.length;
      if((address&&!match)||index>=16384) throw Error('The workbook contains an invalid cell address.');
      const kind=cell.getAttribute('t'), value=nodes(cell,'v')[0]?.textContent??'';
      row[index]=kind==='s' ? shared[Number(value)]||'' : kind==='inlineStr'?textNodes(cell):value;
    }
    return row;
  });
}
export function makeSheet(rows,{tableStart}={}) {
  const ns='http://schemas.openxmlformats.org';
  const header='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const styled=Number.isInteger(tableStart);
  const widths=styled?rows.reduce((columns,row)=>{
    row.forEach((value,index)=>{
      const longest=Math.max(...String(value??'').split(/\r?\n/).map(line=>line.length));
      columns[index]=Math.min(55,Math.max(columns[index]||12,Math.ceil(longest*1.15)+3));
    });
    return columns;
  },[]):[];
  const cols=styled?'<cols>'+widths.map((width,index)=>`<col min="${index+1}" max="${index+1}" width="${width}" customWidth="1"/>`).join('')+'</cols>':'';
  const data=rows.map((row,index)=>{
    const lines=styled?Math.max(1,...row.map((value,col)=>String(value??'').split(/\r?\n/)
      .reduce((sum,line)=>sum+Math.max(1,Math.ceil(line.length/Math.floor((widths[col]-3)/1.15))),0))):1;
    const height=lines>1?` ht="${Math.min(409,lines*16+3)}" customHeight="1"`:'';
    const style=styled&&row.length?` s="${index===tableStart||index===rows.length-1?2:1}"`:'';
    return `<row r="${index+1}"${height}>${row.map((value,col)=>{
      const r=columnName(col)+(index+1);
      return typeof value==='number' && Number.isFinite(value) ? `<c r="${r}"${style}><v>${value}</v></c>` : `<c r="${r}"${style} t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
    }).join('')}</row>`;
  }).join('');
  const styles=`<styleSheet xmlns="${ns}/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>${[0,1].map(font=>`<xf numFmtId="0" fontId="${font}" fillId="0" borderId="1" xfId="0" applyBorder="1" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>`).join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return zip({
    '[Content_Types].xml':header+`<Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>${styled?'<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>':''}</Types>`,
    '_rels/.rels':header+`<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml':header+`<workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':header+`<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>${styled?`<Relationship Id="rId2" Type="${ns}/officeDocument/2006/relationships/styles" Target="styles.xml"/>`:''}</Relationships>`,
    ...(styled?{'xl/styles.xml':header+styles}:{}),
    'xl/worksheets/sheet1.xml':header+`<worksheet xmlns="${ns}/spreadsheetml/2006/main">${cols}<sheetData>${data}</sheetData></worksheet>`,
  });
}
export function makeCsv(rows) {
  const csv=rows.map(row=>row.map(value=>'"'+String(safeCell(value??'')).replaceAll('"','""')+'"').join(',')).join('\r\n');
  return new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'});
}
const pdfText=value=>String(value??'').normalize('NFKD').replace(/[^\x20-\x7e]/g,' ').replace(/[\\()]/g,'\\$&');
export function makePdf(title,rows,{subtitle}={}) {
  const pageWidth=842, pageHeight=595;
  const [head,...body]=rows;
  const objects=['','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
  const pages=[];
  let number=0;
  for(let col=0;col<head.length;col+=9) {
    const labels=head.slice(col,col+9), width=770/labels.length;
    const max=Math.floor(width/4.5)-2;
    const draw=(value,x,y,size=8,font=3)=>`BT /F${font===4?'2':'1'} ${size} Tf ${x.toFixed(2)} ${y} Td (${pdfText(value)}) Tj ET\n`;
    const wrap=value=>{
      const remaining=String(value??'').trim();
      if(!subtitle) return [remaining.length>max?remaining.slice(0,max-3)+'...':remaining];
      return remaining.match(new RegExp(`.{1,${max}}`,'gu'))||[''];
    };
    const cells=record=>record.slice(col,col+labels.length).map(wrap);
    const height=lines=>Math.max(17,Math.max(1,...lines.map(parts=>parts.length))*10+6);
    const drawCells=(lines,y,font)=>lines.map((parts,i)=>parts.map((part,j)=>draw(part,40+i*width,y-j*10,8,font)).join('')).join('');
    let row=0;
    do {
      const heading=labels.map(wrap), headingHeight=height(heading);
      let content='0.10 0.16 0.27 rg\n'+draw(title,36,555,18,4)+draw(subtitle||`Page ${number+1} | ${body.length} records | Columns ${col+1}-${col+labels.length} of ${head.length}`,36,534,9);
      number++;
      if(subtitle) content+=draw(`Page ${number}`,748,534,9);
      content+=`0.91 0.94 0.98 rg 36 ${527-headingHeight} 770 ${headingHeight} re f\n0.10 0.16 0.27 rg\n`+drawCells(heading,514,4);
      let y=527-headingHeight;
      while(row<body.length) {
        const lines=cells(body[row]), rowHeight=height(lines);
        if(y-rowHeight<42&&y<527-headingHeight) break;
        if(row%2===0) content+=`0.97 0.98 1 rg 36 ${y-rowHeight} 770 ${rowHeight} re f\n0.10 0.16 0.27 rg\n`;
        content+=drawCells(lines,y-12,3);
        y-=rowHeight;
        row++;
      }
      const stream=objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
      pages.push(objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${stream} 0 R >>`));
    } while(row<body.length);
  }
  objects[0]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[1]=`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map(page=>page+' 0 R').join(' ')}] >>`;
  let file='%PDF-1.4\n', offsets=[0];
  objects.forEach((object,i)=>{offsets.push(file.length);file+=`${i+1} 0 obj\n${object}\nendobj\n`;});
  const start=file.length;
  file+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return new Blob([file],{type:'application/pdf'});
}
export function download(blob,name) {
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');
  anchor.href=url;
  anchor.download=name;
  anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
