export const linePartsParser = (line:string, letter:string)=>{
  const lineContent = line.replace(`${letter}=`,'');
  return lineContent.split(' ');
}