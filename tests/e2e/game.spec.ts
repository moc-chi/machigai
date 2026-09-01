import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function enter(page:Page,name:string,code?:string){
  await page.goto("http://127.0.0.1:5173/"+(code?"?room="+code:""));
  if(!code){
    await expect(page.getByRole("heading",{name:"みんなで間違い探しを作ろう！"})).toBeVisible();
    await expect(page.getByTestId("hero-sample").locator("figure")).toHaveCount(2);
    await expect(page.getByTestId("hero-sample").locator('img[src="/assets/bakery-changed.png"]')).toHaveCount(1);
    await expect.poll(()=>page.getByTestId("hero-sample").locator("img").evaluateAll(images=>images.every(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth===1536))).toBe(true);
    const heroFigures=await page.getByTestId("hero-sample").locator("figure").all();const first=await heroFigures[0].boundingBox(),second=await heroFigures[1].boundingBox();
    expect(second!.y).toBeGreaterThan(first!.y+first!.height-1);
    await page.getByRole("button",{name:"部屋をつくる",exact:false}).click();
  }
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
  await host.addInitScript(()=>{
    Object.defineProperty(navigator,"canShare",{configurable:true,value:()=>true});
    Object.defineProperty(navigator,"share",{configurable:true,value:async(options:ShareData)=>{(window as unknown as {sharedText?:string}).sharedText=options.text}});
  });
  const failures:string[]=[];for(const page of pages)page.on("pageerror",e=>failures.push(e.message));
  let answerCommands=0;three.on("websocket",ws=>ws.on("framesent",event=>{if(JSON.parse(String(event.payload)).type==="answer.submit")answerCommands++;}));
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
    await expect(host.getByRole("heading",{name:"間違いを2つ描こう"})).toBeVisible();
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
    await expect(host.getByRole("checkbox")).toHaveCount(0);
    await host.evaluate(()=>{
      const state=window as unknown as {testNotices:string[]};state.testNotices=[];
      new MutationObserver(()=>{const text=document.querySelector(".feedback")?.textContent;if(text)state.testNotices.push(text)}).observe(document.body,{childList:true,subtree:true,characterData:true});
    });
    await expect(host.locator(".board-loading")).toHaveCount(0);
    const ownCanvas=host.locator("canvas").last();await ownCanvas.scrollIntoViewIfNeeded();const ownBox=await ownCanvas.boundingBox();
    await ownCanvas.click({position:{x:ownBox!.width*.175,y:ownBox!.height*.265}});
    await expect(host.locator(".feedback")).toContainText("自分で描いた間違いには回答できません");
    const otherCanvas=three.locator("canvas").last();await expect(three.locator(".board-loading")).toHaveCount(0);await otherCanvas.scrollIntoViewIfNeeded();const otherBox=await otherCanvas.boundingBox();
    await otherCanvas.click({position:{x:otherBox!.width*.175,y:otherBox!.height*.265}});
    await expect.poll(()=>host.evaluate(()=>(window as unknown as {testNotices:string[]}).testNotices.some(text=>text.includes("Three が正解")))).toBe(true);
    await expect.poll(()=>host.locator("canvas").evaluateAll(elements=>{
      const [original,changed]=elements as HTMLCanvasElement[];const x=Math.floor(original.width*.175),y=Math.floor(original.height*.265);
      return JSON.stringify([...original.getContext("2d")!.getImageData(x,y,4,4).data])===JSON.stringify([...changed.getContext("2d")!.getImageData(x,y,4,4).data]);
    })).toBe(true);
    const scoreBefore=await three.locator(".scores").innerText(),sentBefore=answerCommands;
    const original=three.locator("canvas").first();await original.scrollIntoViewIfNeeded();const originalBox=await original.boundingBox();
    await original.click({position:{x:originalBox!.width*.98,y:originalBox!.height*.98}});
    await expect(three.locator(".original-notice")).toContainText("こちらは元の絵です");
    expect(answerCommands).toBe(sentBefore);
    await expect(three.locator(".scores")).toHaveText(scoreBefore,{useInnerText:true});
    await expect(three.locator(".cooldown")).toHaveCount(0);
    await expect(three.locator(".original-notice")).toHaveCount(0,{timeout:5000});
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
    await host.getByRole("button",{name:"画像をSNSに共有",exact:true}).click();
    await expect.poll(()=>host.evaluate(()=>(window as unknown as {sharedText?:string}).sharedText)).toBe("まちがいパーティで間違い探しを作りました！ #DifferenceParty");
    const download=host.waitForEvent("download");await host.getByRole("button",{name:"画像を保存",exact:true}).click();
    const file=await download;expect(file.suggestedFilename()).toBe("difference-party.png");
    const pngPath=testInfo.outputPath("shared.png");await file.saveAs(pngPath);const png=await readFile(pngPath);
    expect(png.subarray(1,4).toString()).toBe("PNG");expect(png.readUInt32BE(16)).toBe(1080);expect(png.readUInt32BE(20)).toBe(1920);
    await host.getByRole("button",{name:"最終結果を見る"}).click();
    await expect(host.getByRole("heading",{name:"最終結果"})).toBeVisible();
    await expect(host.getByRole("button",{name:"すべて",exact:true})).toHaveAttribute("aria-pressed","true");
    await expect(host.getByRole("checkbox",{name:"間違いの箇所をマーク"})).toBeChecked();
    await expect(host.locator(".scores .winner")).not.toHaveCount(0);
    await expect(host.getByRole("heading",{name:"ラウンドの得点内訳"})).toBeVisible();
    await expect(host.locator('a[href*="twitter.com"]')).toHaveCount(0);
    await host.getByRole("button",{name:"Two",exact:true}).click();
    await expect(host.getByRole("button",{name:"Two",exact:true})).toHaveAttribute("aria-pressed","true");
    await host.screenshot({path:testInfo.outputPath("results.png"),fullPage:true});
    expect(failures).toEqual([]);
  }finally{for(const context of contexts)await context.close()}
});
test("mobile QR and toolbar fit without horizontal scrolling",async({page,browser},testInfo)=>{
  await page.setViewportSize({width:375,height:812});await enter(page,"Mobile");
  await expect(page.getByText("設定は自動保存されます",{exact:true})).toHaveCount(0);
  await expect(page.getByText(/見える変更面積/)).not.toBeVisible();
  await page.getByRole("button",{name:"ルールを見る",exact:true}).click();
  const rules=page.getByRole("dialog",{name:"ルールを見る"});await expect(rules).toBeVisible();
  await expect(rules).toContainText("描く：");await expect(rules).toContainText("探す：");await expect(rules).toContainText("競う：");
  await expect(rules).not.toContainText("自分で描いた間違いには回答できません");
  await expect(rules).toContainText("間違いの大きさで得点が変わります");
  await expect(rules.getByRole("columnheader")).toHaveText(["大きさ","見つけた人","描いた人"]);
  await expect(rules).toContainText("誤回答は減点されます。");
  const ruleBox=await rules.boundingBox();expect(ruleBox!.width).toBeLessThanOrEqual(375);
  await page.screenshot({path:testInfo.outputPath("mobile-rules.png"),fullPage:true});
  await page.keyboard.press("Escape");await expect(rules).not.toBeVisible();
  await expect(page.getByRole("button",{name:"ルールを見る",exact:true})).toBeFocused();
  await page.getByRole("button",{name:"ルールを見る",exact:true}).click();
  await rules.getByRole("button",{name:"閉じる",exact:true}).click();await expect(rules).not.toBeVisible();
  await expect(page.locator(".deck-thumbnails img")).toHaveCount(10);
  await expect.poll(()=>page.locator(".deck-thumbnails img").evaluateAll(images=>images.every(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth>0))).toBe(true);
  const qr=await page.locator(".real-qr").boundingBox();expect(qr!.x+qr!.width).toBeLessThanOrEqual(375);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  await page.screenshot({path:testInfo.outputPath("mobile-lobby.png"),fullPage:true});
  await page.getByRole("button",{name:"まちの人々",exact:false}).click();
  await expect(page.getByRole("button",{name:"まちの人々",exact:false})).toHaveAttribute("aria-pressed","true");
  const guest=await browser.newPage();
  try{
    await enter(guest,"Guest",(await page.locator(".invite-card>strong").textContent())!);
    await page.getByRole("button",{name:"ゲームをはじめる"}).click();
    await expect(page.getByTestId("confirmed-progress")).toBeVisible();
    await expect(page.getByRole("button",{name:"このフェーズを終了（ホストのみ）",exact:true})).toBeVisible();
    await expect(guest.getByRole("button",{name:"このフェーズを終了（ホストのみ）",exact:true})).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    for(const button of await page.locator(".toolbar button").all()){const b=await button.boundingBox();expect(b!.x).toBeGreaterThanOrEqual(0);expect(b!.x+b!.width).toBeLessThanOrEqual(375)}
    const mode=await page.getByRole("button",{name:"描画",exact:true}).boundingBox();const undo=await page.getByRole("button",{name:"1本戻す",exact:true}).boundingBox();expect(undo!.y).toBe(mode!.y);
    await expect(page.locator(".pen-preview")).not.toContainText("#");
    await page.getByLabel("拡大率",{exact:true}).fill("3");
    await expect(page.locator(".zoom-controls output")).toHaveText("300%");
    await page.getByRole("button",{name:"全体",exact:true}).click();
    await expect(page.locator(".zoom-controls output")).toHaveText("100%");
    await page.getByRole("button",{name:"絵から色を選ぶ",exact:true}).click();
    await expect(page.locator(".board-loading")).toHaveCount(0);
    await page.locator("canvas").click({position:{x:40,y:40}});
    await expect(page.getByRole("button",{name:"描画",exact:true})).toHaveAttribute("aria-pressed","true");
    await page.screenshot({path:testInfo.outputPath("mobile-drawing.png"),fullPage:true});
    await page.getByLabel("太さ",{exact:true}).fill("1");
    await page.locator("canvas").click({position:{x:70,y:70}});
    await page.getByRole("button",{name:"この間違いを確定",exact:true}).click();
    await expect(page.getByRole("alert")).toContainText("変化が小さすぎる");
    await expect(page.getByRole("alert")).toHaveCount(0,{timeout:5000});
    await expect(page.getByRole("button",{name:"1本戻す",exact:true})).toBeEnabled();
    await expect(page.getByTestId("confirmed-progress")).toHaveText("確定 0 / 1");
  }finally{await guest.close()}
});
