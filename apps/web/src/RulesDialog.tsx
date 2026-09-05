import { useEffect, useRef, useState } from "react";
import { AREA_RULES, GAME_DEFAULTS } from "@machigai/shared";
import { useText } from "./i18n";

export function RulesDialog() {
  const t=useText();const dialog=useRef<HTMLDialogElement>(null);const [open,setOpen]=useState(false);const [page,setPage]=useState(0);
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    const node=dialog.current!;node.showModal();
    const previous=document.body.style.overflow;document.body.style.overflow="hidden";
    return()=>{node.close();document.body.style.overflow=previous};
  },[open]);
  return <>
    <button ref={trigger} className="rules-button" onClick={()=>{setPage(0);setOpen(true)}}>{t("rules")}</button>
    <dialog ref={dialog} className="rules-dialog" aria-labelledby="rules-title" onClose={()=>{setOpen(false);trigger.current?.focus()}}>
      <h2 id="rules-title">{t("rules")}</h2>
      {page<2?<ol className="rule-steps"><li><b>{page+1}</b><span>{t(page===0?"ruleDraw":"ruleFind")}</span></li>{page===1&&<li><b>3</b><span>{t("ruleCompete")}</span></li>}</ol>:
      <section className="rule-details"><h3>{t("ruleDetails")}</h3><p>{t("areaIntro")}</p>
        <table><thead><tr><th>{t("differenceSize")}</th><th>{t("finder")}</th><th>{t("creator")}</th></tr></thead><tbody>
          <tr><th>{t("sizeSmall")} (&lt;1%)</th><td>{AREA_RULES.small.finder}</td><td>{AREA_RULES.small.unfound}</td></tr>
          <tr><th>{t("sizeMedium")} (1–3%)</th><td>{AREA_RULES.medium.finder}</td><td>{AREA_RULES.medium.unfound}</td></tr>
          <tr><th>{t("sizeLarge")} (≥3%)</th><td>{AREA_RULES.large.finder}</td><td>{AREA_RULES.large.unfound}</td></tr>
        </tbody></table>
        <p>{t("rulesPenalty",{seconds:GAME_DEFAULTS.missCooldownSeconds,points:GAME_DEFAULTS.missPenalty})}</p></section>}
      <nav className="dialog-pages" aria-label={t("rules")}>{[0,1,2].map(index=><button key={index} aria-pressed={page===index} aria-label={String(index+1)} onClick={()=>setPage(index)}>{index+1}</button>)}</nav>
      <button autoFocus onClick={()=>setOpen(false)}>{t("close")}</button>
    </dialog>
  </>;
}
