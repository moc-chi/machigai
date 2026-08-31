import { useEffect, useRef, useState } from "react";
import { GAME_DEFAULTS } from "@machigai/shared";
import { useText } from "./i18n";

export function RulesDialog() {
  const t=useText();const dialog=useRef<HTMLDialogElement>(null);const [open,setOpen]=useState(false);
  const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    const node=dialog.current!;node.showModal();
    const previous=document.body.style.overflow;document.body.style.overflow="hidden";
    return()=>{node.close();document.body.style.overflow=previous};
  },[open]);
  return <>
    <button ref={trigger} className="rules-button" onClick={()=>setOpen(true)}>{t("rules")}</button>
    <dialog ref={dialog} className="rules-dialog" aria-labelledby="rules-title" onClose={()=>{setOpen(false);trigger.current?.focus()}}>
      <h2 id="rules-title">{t("rules")}</h2>
      <p>{t("rulesFlow")}</p>
      <p>{t("own")}</p>
      <p>{t("areaRule")}</p>
      <p>{t("rulesPenalty",{seconds:GAME_DEFAULTS.missCooldownSeconds,points:GAME_DEFAULTS.missPenalty})}</p>
      <button autoFocus onClick={()=>setOpen(false)}>{t("close")}</button>
    </dialog>
  </>;
}
