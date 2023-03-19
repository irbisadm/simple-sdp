const isDigits = /^\d+$/;
const stringToIntParser = (input:string):number=>{
  if(!isDigits.test(input)){
    throw new Error(`"${input}" is not an integer.`);
  }
  return parseInt(input);
}
export {stringToIntParser}