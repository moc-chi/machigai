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
  await expect(page.locator(".invite-copy strong")).toBeVisible();
}
async function draw(page:Page,x:number,y:number){
  await expect(page.locator(".board-loading")).toHaveCount(0);
  const box=await page.locator("canvas").boundingBox();if(!box)throw new Error("Missing canvas");
  await page.mouse.move(box.x+box.width*x,box.y+box.height*y);
  await page.mouse.down();await page.mouse.move(box.x+box.width*(x+.05),box.y+box.height*(y+.03),{steps:8});await page.mouse.up();
}
async function finishDrawing(page:Page,points:Array<[number,number]>){
  for(let index=0;index<points.length;index++){if(index)await page.getByRole("button",{name:`間違い ${index+1}`,exact:true}).click();await draw(page,...points[index]!)}
  const done=page.getByRole("button",{name:"確定",exact:true});await expect(done).toBeEnabled();await done.click();
}
test("one player skips answering and reaches the round result",async({page})=>{
  await enter(page,"Solo");await expect(page.getByRole("button",{name:"ゲームをはじめる"})).toBeEnabled();await page.getByRole("button",{name:"ゲームをはじめる"}).click();const soloDialog=page.getByRole("dialog",{name:"1人でゲームを始めますか？"});await expect(soloDialog).toBeVisible();await soloDialog.getByRole("button",{name:"ゲームをはじめる",exact:true}).click();
  await draw(page,.35,.35);await page.getByRole("button",{name:"確定",exact:true}).click();await expect(page.getByRole("heading",{name:"ラウンド結果"})).toBeVisible();await expect(page.locator(".answer-phase")).toHaveCount(0);
});
test("three players, settings, two differences, live languages and share image",async({browser},testInfo)=>{
  test.setTimeout(120000);
  const contexts=await Promise.all([browser.newContext(),browser.newContext(),browser.newContext()]);
  const pages=await Promise.all(contexts.map(c=>c.newPage()));const [host,two,three]=pages as [Page,Page,Page];
  await host.addInitScript(()=>{
    Object.defineProperty(navigator,"canShare",{configurable:true,value:()=>true});
    Object.defineProperty(navigator,"share",{configurable:true,value:async(options:ShareData)=>{(window as unknown as {sharedText?:string}).sharedText=options.text}});
  });
  const failures:string[]=[];for(const page of pages)page.on("pageerror",e=>failures.push(e.message));
  let answerCommands=0;three.on("websocket",ws=>ws.on("framesent",event=>{if(JSON.parse(String(event.payload)).type==="answer.submit")answerCommands++;}));
  try{
    await enter(host,"Host");const code=(await host.locator(".invite-copy strong").textContent())!;
    await enter(two,"Two",code);await enter(three,"Three",code);
    await host.getByRole("button",{name:"← 退出する",exact:true}).click();const leaveDialog=host.getByRole("dialog",{name:"退出しますか？"});await expect(leaveDialog).toBeVisible();await leaveDialog.getByRole("button",{name:"キャンセル",exact:true}).click();await expect(leaveDialog).not.toBeVisible();
    await host.setViewportSize({width:1200,height:600});
    const illustrationLobby=await host.locator(".lobby-console").boundingBox();
    const illustrationPanel=await host.locator(".lobby-settings").boundingBox();
    const illustrationPlayers=await host.locator(".lobby-panels>aside").boundingBox();
    const lobbyFooter=await host.locator(".lobby-footer").boundingBox();expect(lobbyFooter!.y+lobbyFooter!.height).toBeLessThanOrEqual(600);
    await host.locator(".settings-tabs").getByRole("button",{name:"ゲーム設定",exact:true}).click();
    const gameLobby=await host.locator(".lobby-console").boundingBox();
    const gamePanel=await host.locator(".lobby-settings").boundingBox();
    const gamePlayers=await host.locator(".lobby-panels>aside").boundingBox();
    const gameFooter=await host.locator(".lobby-footer").boundingBox();
    expect(Math.abs(gameLobby!.width-illustrationLobby!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(gamePanel!.width-illustrationPanel!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(gamePlayers!.width-illustrationPlayers!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(gameFooter!.width-lobbyFooter!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(gamePanel!.height-illustrationPanel!.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(gamePlayers!.height-illustrationPlayers!.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(gamePanel!.height-gamePlayers!.height)).toBeLessThanOrEqual(1);
    await host.setViewportSize({width:1280,height:720});
    await expect(host.getByLabel("ラウンド数")).toHaveValue("1");
    await host.getByLabel("1人あたりの間違い数").selectOption("2");
    await two.locator(".settings-tabs").getByRole("button",{name:"ゲーム設定",exact:true}).click();
    await expect(two.locator(".setting-labels")).toContainText("2個");
    for(const language of ["en","zh-CN","zh-TW","ko","de","fr","es","pt-BR","ja"]){
      await host.getByLabel("Language",{exact:true}).selectOption(language);
      await expect(host.locator("html")).toHaveAttribute("lang",language);
      if(language!=="ja")await expect(host.locator("main")).not.toContainText("参加メンバー");
    }
    await host.getByRole("button",{name:"ゲームをはじめる"}).click();
    await expect(host.locator(".drawing-phase")).toBeVisible();
    await expect(host.getByLabel("Language",{exact:true})).toHaveCount(0);
    await expect(host.getByTestId("confirmed-progress")).toHaveText("未確定");
    await expect(host.getByRole("button",{name:"間違い 1",exact:true})).toHaveClass(/slot-invalid/);
    await expect(host.getByRole("button",{name:"確定",exact:true})).toBeDisabled();
    await draw(host,.15,.25);await host.getByRole("button",{name:"間違い 2",exact:true}).click();await draw(host,.15,.25);
    await expect(host.getByRole("button",{name:"間違い 2",exact:true})).toHaveClass(/slot-invalid/);await expect(host.getByRole("button",{name:"確定",exact:true})).toBeDisabled();
    await host.getByRole("button",{name:"全部消す",exact:true}).click();await draw(host,.15,.65);await expect(host.getByRole("button",{name:"確定",exact:true})).toBeEnabled();await host.getByRole("button",{name:"確定",exact:true}).click();
    await expect(host.getByTestId("confirmed-progress")).toHaveText("すべて確定しました");
    await finishDrawing(two,[[.45,.25],[.45,.65]]);
    await finishDrawing(three,[[.7,.25],[.7,.65]]);
    await expect(host.getByRole("heading",{name:"まもなく回答スタート"})).toBeVisible();
    await expect(host.locator(".answer-phase")).toBeVisible();
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
    const sentBefore=answerCommands;
    const original=three.locator("canvas").first();await original.scrollIntoViewIfNeeded();const originalBox=await original.boundingBox();
    await original.click({position:{x:originalBox!.width*.45,y:originalBox!.height*.265}});
    await expect(three.locator(".answer-popup.correct")).toContainText("正解！+");
    expect(answerCommands).toBe(sentBefore+1);
    await expect(three.locator(".cooldown")).toHaveCount(0);
    await expect(two.locator(".board-loading")).toHaveCount(0);
    const canvas=two.locator("canvas").last();await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();if(!box)throw new Error("No answer image");
    await canvas.click({position:{x:box.width*.98,y:box.height*.98}});
    await expect(host.locator(".feedback.miss")).toHaveCount(0);
    await expect(two.locator(".answer-popup.miss")).toContainText("不正解 -20点");
    await expect(two.locator(".answer-popup.miss small")).toContainText("あと 3秒");
    host.once("dialog",d=>void d.accept());await host.getByRole("button",{name:"このフェーズを終了"}).click();
    await expect(host.getByRole("heading",{name:"ラウンド結果"})).toBeVisible();
    await expect(host.getByRole("button",{name:"間違い探しを保存",exact:true})).toBeEnabled();
    const xPost=host.getByRole("link",{name:"Xへポスト",exact:true});await expect(xPost).toHaveAttribute("href",/twitter\.com\/intent\/tweet/);expect(new URL((await xPost.getAttribute("href"))!).searchParams.get("url")).toBe("http://127.0.0.1:5173/");
    await expect(host.getByRole("button",{name:"画像をコピー",exact:true})).toHaveCount(3);
    await host.setViewportSize({width:320,height:568});await host.getByRole("button",{name:"共有",exact:true}).click();
    await expect.poll(()=>host.evaluate(()=>(window as unknown as {sharedText?:string}).sharedText)).toBe("まちがいパーティーで間違い探しをつくった！ #DifferenceParty");
    await host.setViewportSize({width:1280,height:720});
    const download=host.waitForEvent("download");await host.getByRole("button",{name:"間違い探しを保存",exact:true}).click();
    const file=await download;expect(file.suggestedFilename()).toBe("difference-party.png");
    const pngPath=testInfo.outputPath("shared.png");await file.saveAs(pngPath);const png=await readFile(pngPath);
    expect(png.subarray(1,4).toString()).toBe("PNG");expect(png.readUInt32BE(16)).toBe(1080);expect(png.readUInt32BE(20)).toBe(1920);
    await host.getByRole("button",{name:"最終結果を見る"}).click();
    await expect(host.getByRole("heading",{name:"最終結果"})).toBeVisible();
    await expect(host.locator(".scores .winner")).not.toHaveCount(0);
    await expect(host.getByRole("heading",{name:"ラウンドの得点内訳"})).toBeVisible();
    await host.getByRole("button",{name:"作品",exact:true}).click();
    await expect(host.getByRole("button",{name:"すべて",exact:true})).toHaveAttribute("aria-pressed","true");
    await expect(host.getByRole("checkbox",{name:"間違いの箇所をマーク"})).toBeChecked();
    await expect(host.locator('a[href*="twitter.com"]')).toHaveCount(1);
    await host.getByRole("button",{name:"Two",exact:true}).click();
    await expect(host.getByRole("button",{name:"Two",exact:true})).toHaveAttribute("aria-pressed","true");
    await host.setViewportSize({width:320,height:568});
    expect(await host.evaluate(()=>document.documentElement.scrollHeight===window.innerHeight)).toBe(true);
    await expect(host.getByRole("button",{name:"作品",exact:true})).toBeVisible();
    await host.getByRole("button",{name:"退出する",exact:true}).click();await expect(host.getByRole("dialog",{name:"退出しますか？"})).toBeVisible();await host.getByRole("dialog",{name:"退出しますか？"}).getByRole("button",{name:"退出する",exact:true}).click();await expect(host.getByRole("heading",{name:"みんなで間違い探しを作ろう！"})).toBeVisible();
    expect(failures).toEqual([]);
  }finally{for(const context of contexts)await context.close()}
});
test("mobile QR and toolbar fit without horizontal scrolling",async({page,browser},testInfo)=>{
  test.setTimeout(120000);
  page.setDefaultTimeout(5000);
  await page.setViewportSize({width:320,height:568});await enter(page,"Mobile");
  expect(await page.evaluate(()=>document.documentElement.scrollHeight)).toBe(568);
  await expect(page.getByText("設定は自動保存されます",{exact:true})).toHaveCount(0);
  await expect(page.getByText(/見える変更面積/)).not.toBeVisible();
  await page.getByRole("button",{name:"遊び方",exact:true}).click();
  const rules=page.getByRole("dialog",{name:"遊び方"});await expect(rules).toBeVisible();
  await expect(rules).toContainText("描く：");await expect(rules).not.toContainText("探す：");
  await rules.getByRole("button",{name:"2",exact:true}).click();await expect(rules).toContainText("探す：");await expect(rules).toContainText("競う：");
  await expect(rules).not.toContainText("自分で描いた間違いには回答できません");
  await rules.getByRole("button",{name:"3",exact:true}).click();
  await expect(rules).toContainText("間違いの大きさで得点が変わります");
  await expect(rules.getByRole("columnheader")).toHaveText(["大きさ","見つけた人","描いた人"]);
  await expect(rules).toContainText("誤回答は減点されます。");
  const ruleBox=await rules.boundingBox();expect(ruleBox!.width).toBeLessThanOrEqual(320);
  await page.keyboard.press("Escape");await expect(rules).not.toBeVisible();
  await expect(page.getByRole("button",{name:"遊び方",exact:true})).toBeFocused();
  await page.getByRole("button",{name:"遊び方",exact:true}).click();
  await rules.getByRole("button",{name:"閉じる",exact:true}).click();await expect(rules).not.toBeVisible();
  await page.getByRole("button",{name:"招待URLをコピー",exact:true}).click();
  await page.getByRole("button",{name:"QRコードを表示",exact:true}).click();
  const qr=await page.locator(".real-qr").boundingBox();expect(qr!.x+qr!.width).toBeLessThanOrEqual(320);
  await page.getByRole("button",{name:"閉じる",exact:true}).click();
  await page.getByRole("button",{name:"ゲーム設定",exact:true}).click();
  await expect(page.locator(".lobby-settings .series-options img")).toHaveCount(2);
  await expect(page.locator(".dummy-genre")).toHaveCount(8);
  expect(await page.locator(".series-scroll").evaluate(node=>({overflow:getComputedStyle(node).overflowY,scroll:node.scrollHeight,client:node.clientHeight}))).toMatchObject({overflow:"auto"});
  expect(await page.locator(".series-scroll").evaluate(node=>node.scrollHeight>node.clientHeight)).toBe(true);
  await expect.poll(()=>page.locator(".lobby-settings .series-options img").evaluateAll(images=>images.every(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth>0))).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const chooserPromise=page.waitForEvent("filechooser");await page.getByRole("button",{name:"オリジナル",exact:false}).click();const chooser=await chooserPromise;
  await chooser.setFiles("C:/machigai/apps/web/public/assets/bakery.png");
  await expect(page.getByRole("button",{name:"オリジナル",exact:false})).toHaveAttribute("aria-pressed","true");
  await expect(page.getByRole("button",{name:"オリジナル",exact:false}).locator("img")).toHaveAttribute("src",/^blob:/);
  await expect(page.getByText("画面確認用です。まだゲームには使用されません。",{exact:true})).toHaveCount(0);
  await page.getByRole("button",{name:"まちの人々",exact:false}).click();
  await expect(page.getByRole("button",{name:"まちの人々",exact:false})).toHaveAttribute("aria-pressed","true");
  const guest=await browser.newPage();
  try{
    await enter(guest,"Guest",(await page.locator(".invite-copy strong").textContent())!);
    await page.setViewportSize({width:320,height:400});await expect(page.getByRole("button",{name:"ゲームをはじめる"})).toBeVisible();await page.setViewportSize({width:320,height:568});
    await page.getByRole("button",{name:"ゲームをはじめる"}).click();
    await expect(page.getByTestId("confirmed-progress")).toBeVisible();
    await expect(page.getByRole("heading",{name:"間違いを1つ描こう"})).toHaveCount(0);
    await expect(page.getByRole("button",{name:"このフェーズを終了（ホストのみ）",exact:true})).toHaveCount(0);
    await expect(guest.getByRole("button",{name:"このフェーズを終了（ホストのみ）",exact:true})).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
    for(const button of await page.locator(".toolbar button").all()){const b=await button.boundingBox();expect(b!.x).toBeGreaterThanOrEqual(0);expect(b!.x+b!.width).toBeLessThanOrEqual(320)}
    const mode=await page.getByRole("button",{name:"描画",exact:true}).boundingBox();const undo=await page.getByRole("button",{name:"1本戻す",exact:true}).boundingBox();expect(Math.abs(undo!.y-mode!.y)).toBeLessThanOrEqual(6);
    await expect(page.locator(".pen-preview")).not.toContainText("#");
    await page.getByLabel("拡大率",{exact:true}).fill("3");
    await expect(page.locator(".zoom-controls output")).toHaveText("300%");
    const viewport=await page.locator(".board-viewport").boundingBox();const transformBefore=await page.locator(".board-layer").getAttribute("style");
    await page.mouse.move(viewport!.x+viewport!.width/2,viewport!.y+viewport!.height/2);await page.mouse.down({button:"middle"});await page.mouse.move(viewport!.x+viewport!.width/2+25,viewport!.y+viewport!.height/2+10);await page.mouse.up({button:"middle"});
    await expect(page.locator(".board-layer")).not.toHaveAttribute("style",transformBefore!);
    await page.getByRole("button",{name:"全体表示",exact:true}).click();
    await expect(page.locator(".zoom-controls output")).toHaveText("100%");
    const colorBefore=await page.getByLabel("色",{exact:true}).inputValue();
    await page.getByRole("button",{name:"絵から色を選ぶ",exact:true}).click();
    await expect(page.getByText("絵をタップして色を取得",{exact:true})).toBeVisible();
    expect(await page.locator(".board-viewport").evaluate(node=>getComputedStyle(node).cursor)).toContain("url(");
    await expect(page.locator(".board-loading")).toHaveCount(0);
    await page.locator("canvas").click({position:{x:40,y:40}});
    await expect(page.getByRole("button",{name:"描画",exact:true})).toHaveAttribute("aria-pressed","true");
    expect(await page.getByLabel("色",{exact:true}).inputValue()).not.toBe(colorBefore);
    expect(await page.locator(".board-viewport").evaluate(node=>getComputedStyle(node).cursor)).toBe("none");
    await page.keyboard.down("Space");await expect(page.getByRole("button",{name:"絵から色を選ぶ",exact:true})).toHaveAttribute("aria-pressed","true");
    await page.keyboard.up("Space");await expect(page.getByRole("button",{name:"描画",exact:true})).toHaveAttribute("aria-pressed","true");
    await page.getByLabel("太さ",{exact:true}).fill("1");
    await page.locator("canvas").click({position:{x:70,y:70}});
    await expect(page.getByRole("button",{name:"確定",exact:true})).toBeDisabled();
    await expect(page.getByRole("button",{name:"1本戻す",exact:true})).toBeEnabled();
    await expect(page.getByTestId("confirmed-progress")).toHaveText("未確定");
  }finally{await guest.close()}
});

test("all ready submits the latest local drawings once before countdown",async({browser})=>{
  const host=await browser.newPage(),guest=await browser.newPage();
  try{
    await enter(host,"Host");const code=(await host.locator(".invite-copy strong").textContent())!;
    await enter(guest,"Guest",code);
    await host.getByRole("button",{name:"ゲームをはじめる"}).click();
    await expect(host.locator(".board-loading")).toHaveCount(0);
    const fullWidthBoard=await host.locator(".drawing-workspace>.image-board>.board-viewport").boundingBox();
    expect(fullWidthBoard!.x).toBeLessThanOrEqual(1);
    expect(fullWidthBoard!.x+fullWidthBoard!.width).toBeGreaterThanOrEqual(1279);
    await draw(host,.2,.5);
    await expect(host.getByRole("button",{name:"確定",exact:true})).toHaveAttribute("data-validation","valid");
    await host.getByRole("button",{name:"確定",exact:true}).click();
    await draw(host,.35,.35);
    await draw(guest,.65,.65);await expect(guest.getByRole("button",{name:"確定",exact:true})).toBeEnabled();await guest.getByRole("button",{name:"確定",exact:true}).click();
    await expect(host.getByRole("heading",{name:"みんなの間違いを統合中…"})).toBeVisible();
    await expect(host.getByRole("heading",{name:"まもなく回答スタート"})).toBeVisible({timeout:5000});
    await expect(host.locator(".answer-phase")).toBeVisible({timeout:7000});
    await expect(host.locator(".answer-phase")).toContainText("0/2");
  }finally{await host.close();await guest.close()}
});
