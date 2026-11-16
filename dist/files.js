const enc = new TextEncoder();
const dec = new TextDecoder();
const xml = value => String(value ?? '').replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]));
const safeCell = value => typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? "'"+value : value;
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
  const files={};
  const count=v.getUint16(end+10,true);
  for(let i=0;i<count;i++) {
    if(v.getUint32(ptr,true)!==0x02014b50) throw Error('The workbook directory could not be read.');
    const method=v.getUint16(ptr+10,true), size=v.getUint32(ptr+20,true), expanded=v.getUint32(ptr+24,true);
    const nameLen=v.getUint16(ptr+28,true), extra=v.getUint16(ptr+30,true), comment=v.getUint16(ptr+32,true);
    const name=dec.decode(new Uint8Array(buffer,ptr+46,nameLen));
    const location=v.getUint32(ptr+42,true);
    ptr+=46+nameLen+extra+comment;
    if(!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(name)) continue;
    if(expanded>30_000_000) throw Error('This workbook sheet is too large for the demo.');
    const start=location+30+v.getUint16(location+26,true)+v.getUint16(location+28,true);
    const compressed=new Uint8Array(buffer,start,size);
    if(method===0) files[name]=dec.decode(compressed);
    else if(method===8) files[name]=dec.decode(await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else throw Error('This Excel compression format is unsupported. Save the file as CSV and retry.');
  }
  return files;
}
function parseXml(source) {
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
      const letters=(cell.getAttribute('r')||'').match(/^[A-Z]+/)?.[0];
      const index=letters ? lettersToIndex(letters) : row.length;
      const kind=cell.getAttribute('t'), value=nodes(cell,'v')[0]?.textContent??'';
      row[index]=kind==='s' ? shared[Number(value)]||'' : kind==='inlineStr'?textNodes(cell):value;
    }
    return row;
  });
}
export function makeSheet(rows) {
  const ns='http://schemas.openxmlformats.org';
  const header='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const data=rows.map((row,index)=>`<row r="${index+1}">${row.map((value,col)=>{
    const r=columnName(col)+(index+1);
    return typeof value==='number' && Number.isFinite(value) ? `<c r="${r}"><v>${value}</v></c>` : `<c r="${r}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }).join('')}</row>`).join('');
  return zip({
    '[Content_Types].xml':header+`<Types xmlns="${ns}/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    '_rels/.rels':header+`<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    'xl/workbook.xml':header+`<workbook xmlns="${ns}/spreadsheetml/2006/main" xmlns:r="${ns}/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels':header+`<Relationships xmlns="${ns}/package/2006/relationships"><Relationship Id="rId1" Type="${ns}/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    'xl/worksheets/sheet1.xml':header+`<worksheet xmlns="${ns}/spreadsheetml/2006/main"><sheetData>${data}</sheetData></worksheet>`,
  });
}
export function makeCsv(rows) {
  const csv=rows.map(row=>row.map(value=>'"'+String(safeCell(value??'')).replaceAll('"','""')+'"').join(',')).join('\r\n');
  return new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'});
}
const pdfText=value=>String(value??'').normalize('NFKD').replace(/[^\x20-\x7e]/g,' ').replace(/[\\()]/g,'\\$&');
export function makePdf(title,rows) {
  const pageWidth=842, pageHeight=595, perPage=26;
  const [head,...body]=rows;
  const objects=['','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
  const pages=[];
  let number=0;
  for(let row=0;row<Math.max(1,body.length);row+=perPage) {
    for(let col=0;col<head.length;col+=9) {
      const labels=head.slice(col,col+9), width=770/labels.length;
      const draw=(value,x,y,size=8,font=3)=>`BT /F${font===4?'2':'1'} ${size} Tf ${x.toFixed(2)} ${y} Td (${pdfText(value)}) Tj ET\n`;
      let content='0.10 0.16 0.27 rg\n'+draw(title,36,555,18,4)+draw(`Page ${++number} | ${body.length} records | Columns ${col+1}-${col+labels.length} of ${head.length}`,36,534,9);
      content+='0.91 0.94 0.98 rg 36 507 770 20 re f\n0.10 0.16 0.27 rg\n';
      const shorten=(value,len)=>String(value??'').length>len?String(value).slice(0,len-3)+'...':value;
      const max=Math.floor(width/4.5)-2;
      labels.forEach((label,i)=>{content+=draw(shorten(label,max),40+i*width,514,8,4);});
      body.slice(row,row+perPage).forEach((record,j)=>{
        if(j%2===0) content+=`0.97 0.98 1 rg 36 ${490-j*17} 770 17 re f\n0.10 0.16 0.27 rg\n`;
        record.slice(col,col+labels.length).forEach((value,i)=>{content+=draw(shorten(value,max),40+i*width,496-j*17);});
      });
      const stream=objects.push(`<< /Length ${content.length} >>\nstream\n${content}endstream`);
      pages.push(objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${stream} 0 R >>`));
    }
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
