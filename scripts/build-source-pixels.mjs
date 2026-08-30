import sharp from "sharp";
import { readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { AREA_RULES } from "../packages/shared/src/scoring.ts";
const directory=new URL("../apps/web/public/assets/",import.meta.url);
for(const name of await readdir(directory)){
  if(!name.endsWith(".png"))continue;
  const file=fileURLToPath(new URL(name,directory)),metadata=await sharp(file).metadata();
  const width=AREA_RULES.sampleWidth,height=Math.round(width*metadata.height/metadata.width);
  const rgb=await sharp(file).resize(width,height,{kernel:"nearest"}).removeAlpha().toColourspace("srgb").raw().toBuffer();
  if(rgb.length!==width*height*3)throw new Error("Invalid source pixels: "+name);
  await writeFile(new URL(name+".rgb",directory),rgb);
  console.log(name+": "+metadata.width+"x"+metadata.height+" verified");
}
