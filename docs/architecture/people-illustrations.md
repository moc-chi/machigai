# 人間シリーズの画像生成記録

組み込みimage_genを使用（CLI/APIフォールバックなし）。ユーザー承認済みの市場の絵をスタイル参照として、太い輪郭線と漫画調の人物を維持して別の4場面を生成。全5枚1448×1086、ゲーム内の各シリーズ5枚で統一。生成画像を目視し、人物・輪郭・場面・文字やUIがないことを確認。

保存先は `apps/web/public/assets/people-market.png`、以下4枚。市場のプロンプトは [第2回更新](iteration-2.md) に記載。

## people-park

保存先: `apps/web/public/assets/people-park.png`

```text
Use case: illustration-story
Asset type: original source illustration for a mobile spot-the-difference game
Input image 1: STYLE REFERENCE ONLY, the approved neighborhood market; create a NEW scene, not a modification of its marketplace composition.
Primary request: a cheerful public park picnic: families on a picnic blanket with food baskets, friends tossing a ball, a person watering flowers, bench, simple playground and pond in the background.
Style: match the reference very closely: bold continuous dark black/navy outlines on every character and object, flat cheerful saturated colors, friendly simple cartoon faces, rounded figures, minimal shading, no painterly texture. Same line weight, character proportions, visual density and clean phone-size readability as the reference. About 8 to 10 human characters dominate the scene. Large clear props, no tiny clutter.
Composition: landscape 4:3 full scene, natural distinct composition, safe margins, evenly distributed landmarks for drawing differences.
Constraints: single original source illustration, NOT a side-by-side puzzle. No deliberately inserted differences. No text, letters, numbers, brands, logos, watermark, frame or UI.
```

## people-kitchen

保存先: `apps/web/public/assets/people-kitchen.png`

```text
Use case: illustration-story
Asset type: original source illustration for a mobile spot-the-difference game
Input image 1: STYLE REFERENCE ONLY, the approved neighborhood market; create a NEW scene, not a modification of its marketplace composition.
Primary request: a cheerful community cooking class in a spacious kitchen: people preparing vegetables, kneading dough, carrying a tray and setting a table, clear pots, plates, utensils and cupboards.
Style: match the reference very closely: bold continuous dark black/navy outlines on every character and object, flat cheerful saturated colors, friendly simple cartoon faces, rounded figures, minimal shading, no painterly texture. Same line weight, character proportions, visual density and clean phone-size readability as the reference. About 8 to 10 human characters dominate the scene. Large clear props, no tiny clutter.
Composition: landscape 4:3 full scene, natural distinct composition, safe margins, evenly distributed landmarks for drawing differences.
Constraints: single original source illustration, NOT a side-by-side puzzle. No deliberately inserted differences. No text, letters, numbers, brands, logos, watermark, frame or UI.
```

## people-library

保存先: `apps/web/public/assets/people-library.png`

```text
Use case: illustration-story
Asset type: original source illustration for a mobile spot-the-difference game
Input image 1: STYLE REFERENCE ONLY, the approved neighborhood market; create a NEW scene, not a modification of its marketplace composition.
Primary request: a friendly neighborhood library: people browsing shelves, reading at tables and on a sofa, a librarian arranging a book cart, simple plants and a globe, book spines with NO text.
Style: match the reference very closely: bold continuous dark black/navy outlines on every character and object, flat cheerful saturated colors, friendly simple cartoon faces, rounded figures, minimal shading, no painterly texture. Same line weight, character proportions, visual density and clean phone-size readability as the reference. About 8 to 10 human characters dominate the scene. Large clear props, no tiny clutter.
Composition: landscape 4:3 full scene, natural distinct composition, safe margins, evenly distributed landmarks for drawing differences.
Constraints: single original source illustration, NOT a side-by-side puzzle. No deliberately inserted differences. No text, letters, numbers, brands, logos, watermark, frame or UI.
```

## people-festival

保存先: `apps/web/public/assets/people-festival.png`

```text
Use case: illustration-story
Asset type: original source illustration for a mobile spot-the-difference game
Input image 1: STYLE REFERENCE ONLY, the approved neighborhood market; create a NEW scene, not a modification of its marketplace composition.
Primary request: a neighborhood outdoor summer festival in daylight: people playing a ring-toss game, carrying balloons, serving snacks and playing a drum, simple bunting, stalls and clearly separated props.
Style: match the reference very closely: bold continuous dark black/navy outlines on every character and object, flat cheerful saturated colors, friendly simple cartoon faces, rounded figures, minimal shading, no painterly texture. Same line weight, character proportions, visual density and clean phone-size readability as the reference. About 8 to 10 human characters dominate the scene. Large clear props, no tiny clutter.
Composition: landscape 4:3 full scene, natural distinct composition, safe margins, evenly distributed landmarks for drawing differences.
Constraints: single original source illustration, NOT a side-by-side puzzle. No deliberately inserted differences. No text, letters, numbers, brands, logos, watermark, frame or UI.
```

