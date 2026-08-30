import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function enter(page:Page,name:string,code?:string){
  await page.goto("http://127.0.0.1:5173/"+(code?"?room="+code:""));
  if(!code)await page.getByRole("button",{name:"部屋をつくる",exact:false}).click();
  await page.getByLabel("ニックネーム").fill(name);
  await page.locator("form").getByRole("button",{name:code?"部屋に参加":"部屋をつくる",exact:true}).click();
  await expect(page.locator(".invite-card>strong")).toBeVisible();
}
async function draw(page:Page,x:number,y:number){
  await expect(page.locator(".board-loading")).toHaveCount(0);
  const box=await page.locator("canvas").boundingBox();if(!box)throw new Error("Missing canvas");
  await page.mouse.move(box.x+box.width*x,box.y+box.height*y);
  await page.mouse.down();await page.mouse.move(box.x+box.width*(x+.05),box.y+box.height*(y+.03),{steps:8});await page.mouse.up();
  await page.getByRole("button",{name:"この間違いを確定",exact:true}).click();
}
test("three players, settings, two differences, live languages and share image",async({browser},testInfo)=>{
  const contexts=await Promise.all([browser.newContext(),browser.newContext(),browser.newContext()]);
  const pages=await Promise.all(contexts.map(c=>c.newPage()));const [host,two,three]=pages as [Page,Page,Page];
  const failures:string[]=[];for(const page of pages)page.on("pageerror",e=>failures.push(e.message));
  try{
    await enter(host,"Host");const code=(await host.locator(".invite-card>strong").textContent())!;
    await enter(two,"Two",code);await enter(three,"Three",code);
    await expect(host.getByLabel("ラウンド数")).toHaveValue("1");
    await host.getByLabel("1人あたりの間違い数").selectOption("2");
    await expect(two.getByLabel("1人あたりの間違い数")).toHaveValue("2");
    for(const language of ["en","zh-CN","zh-TW","ko","de","fr","es","pt-BR","ja"]){
      await host.getByLabel("Language",{exact:true}).selectOption(language);
      await expect(host.locator("html")).toHaveAttribute("lang",language);
      if(language!=="ja")await expect(host.locator("main")).not.toContainText("参加メンバー");
    }
    await host.getByRole("button",{name:"ゲームをはじめる"}).click();
    await expect(host.getByTestId("confirmed-progress")).toHaveText("確定 0 / 2");
    await draw(host,.15,.25);await expect(host.getByTestId("confirmed-progress")).toHaveText("確定 1 / 2");
    await host.getByLabel("Language",{exact:true}).selectOption("de");
    await expect(host.getByTestId("confirmed-progress")).toHaveText("Bestätigt 1 / 2");
    await host.getByLabel("Language",{exact:true}).selectOption("ja");
    await draw(host,.15,.65);await expect(host.getByTestId("confirmed-progress")).toHaveText("確定 2 / 2");
    await draw(two,.45,.25);await expect(two.getByTestId("confirmed-progress")).toHaveText("確定 1 / 2");
    await draw(two,.45,.65);
    await draw(three,.7,.25);await draw(three,.7,.65);
    await expect(host.getByRole("heading",{name:"まもなく回答スタート"})).toBeVisible();
    await expect(host.getByRole("heading",{name:"みんなの間違いを見つけよう"})).toBeVisible();
    await expect(two.locator(".board-loading")).toHaveCount(0);
    const canvas=two.locator("canvas").last();await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();if(!box)throw new Error("No answer image");
    await canvas.click({position:{x:box.width*.98,y:box.height*.98}});
    await expect(host.locator(".feedback")).toContainText("Two は不正解");
    await expect(two.locator(".cooldown")).toBeVisible();
    await host.getByLabel("Language",{exact:true}).selectOption("fr");
    await expect(host.getByRole("heading",{name:"Trouvez les différences"})).toBeVisible();
    await host.getByLabel("Language",{exact:true}).selectOption("ja");
    host.once("dialog",d=>void d.accept());await host.getByRole("button",{name:"このフェーズを終了"}).click();
    await expect(host.getByRole("heading",{name:"ラウンド結果"})).toBeVisible();
    await expect(host.getByRole("button",{name:"画像を保存",exact:true})).toBeEnabled();
    const download=host.waitForEvent("download");await host.getByRole("button",{name:"画像を保存",exact:true}).click();
    const file=await download;expect(file.suggestedFilename()).toBe("difference-party.png");
    const pngPath=testInfo.outputPath("shared.png");await file.saveAs(pngPath);const png=await readFile(pngPath);
    expect(png.subarray(1,4).toString()).toBe("PNG");expect(png.readUInt32BE(16)).toBe(1600);expect(png.readUInt32BE(20)).toBeGreaterThan(600);
    await host.getByRole("button",{name:"最終結果を見る"}).click();
    await expect(host.getByRole("heading",{name:"最終結果"})).toBeVisible();
    await expect(host.getByRole("button",{name:"全部入り",exact:true})).toHaveAttribute("aria-pressed","true");
    await host.getByRole("button",{name:"Two",exact:true}).click();
    await expect(host.getByRole("button",{name:"Two",exact:true})).toHaveAttribute("aria-pressed","true");
    await host.screenshot({path:testInfo.outputPath("results.png"),fullPage:true});
    expect(failures).toEqual([]);
  }finally{for(const context of contexts)await context.close()}
});
test("mobile QR and toolbar fit without horizontal scrolling",async({page,browser},testInfo)=>{
  await page.setViewportSize({width:375,height:812});await enter(page,"Mobile");
  const qr=await page.locator(".real-qr").boundingBox();expect(qr!.x+qr!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({path:testInfo.outputPath("mobile-lobby.png"),fullPage:true});
  const guest=await browser.newPage();
  try{
    await enter(guest,"Guest",(await page.locator(".invite-card>strong").textContent())!);
    await page.getByRole("button",{name:"ゲームをはじめる"}).click();
    await expect(page.getByTestId("confirmed-progress")).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    for(const button of await page.locator(".toolbar button").all()){const b=await button.boundingBox();expect(b!.x).toBeGreaterThanOrEqual(0);expect(b!.x+b!.width).toBeLessThanOrEqual(375)}
    await page.getByLabel("拡大率",{exact:true}).fill("3");
    await expect(page.locator(".zoom-controls output")).toHaveText("300%");
    await page.getByRole("button",{name:"全体",exact:true}).click();
    await expect(page.locator(".zoom-controls output")).toHaveText("100%");
    await page.getByRole("button",{name:"絵から色を選ぶ",exact:true}).click();
    await expect(page.locator(".board-loading")).toHaveCount(0);
    await page.locator("canvas").click({position:{x:40,y:40}});
    await expect(page.getByRole("button",{name:"描画",exact:true})).toHaveAttribute("aria-pressed","true");
    await page.screenshot({path:testInfo.outputPath("mobile-drawing.png"),fullPage:true});
  }finally{await guest.close()}
});
