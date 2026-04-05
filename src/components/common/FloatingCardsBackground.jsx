import React from "react";

/** Decorative floating background cards — fixed wallpaper, z-1 keeps it below all UI (desktop only) */
export default function FloatingCardsBackground() {
  return (
    <div aria-hidden="true" style={{position:"fixed",inset:0,zIndex:1,pointerEvents:"none",overflow:"hidden"}}>
      {/* Colonne gauche */}
      <div className="login-deco-card" style={{"--rot":"-12deg","--dur":"7s","--delay":"0s",top:"5%",left:"2%",borderTop:"3px solid rgba(99,102,241,0.7)"}}>
        <div className="deco-title" style={{background:"rgba(99,102,241,0.5)"}}/>
        <div className="deco-line" style={{width:"90%"}}/>
        <div className="deco-line" style={{width:"75%"}}/>
        <div className="deco-line" style={{width:"60%"}}/>
      </div>
      <div className="login-deco-card" style={{"--rot":"5deg","--dur":"9s","--delay":"-2s",top:"32%",left:"1%",borderTop:"3px solid rgba(168,85,247,0.7)"}}>
        <div className="deco-title" style={{background:"rgba(168,85,247,0.5)"}}/>
        <div className="deco-line" style={{width:"85%"}}/>
        <div className="deco-line" style={{width:"55%"}}/>
      </div>
      <div className="login-deco-card" style={{"--rot":"8deg","--dur":"8s","--delay":"-4s",top:"60%",left:"3%",borderTop:"3px solid rgba(16,185,129,0.7)"}}>
        <div className="deco-title" style={{background:"rgba(16,185,129,0.5)"}}/>
        <div className="deco-line" style={{width:"80%"}}/>
        <div className="deco-line" style={{width:"65%"}}/>
        <div className="deco-line" style={{width:"45%"}}/>
      </div>
      <div className="login-deco-card" style={{"--rot":"-6deg","--dur":"10s","--delay":"-7s",top:"83%",left:"5%",borderTop:"3px solid rgba(245,158,11,0.7)"}}>
        <div className="deco-title" style={{background:"rgba(245,158,11,0.5)"}}/>
        <div className="deco-line" style={{width:"78%"}}/>
        <div className="deco-line" style={{width:"55%"}}/>
      </div>
      {/* Colonne centre-gauche */}
      <div className="login-deco-card" style={{"--rot":"10deg","--dur":"8.5s","--delay":"-1.5s",top:"12%",left:"22%",borderTop:"3px solid rgba(249,115,22,0.7)"}}>
        <div className="deco-title" style={{background:"rgba(249,115,22,0.5)"}}/>
        <div className="deco-line" style={{width:"82%"}}/>
        <div className="deco-line" style={{width:"64%"}}/>
        <div className="deco-line" style={{width:"50%"}}/>
      </div>
      <div className="login-deco-card" style={{"--rot":"-7deg","--dur":"9.5s","--delay":"-6s",top:"46%",left:"20%",borderTop:"3px solid rgba(14,165,233,0.7)"}}>
        <div className="deco-title" style={{background:"rgba(14,165,233,0.5)"}}/>
        <div className="deco-line" style={{width:"88%"}}/>
        <div className="deco-line" style={{width:"58%"}}/>
      </div>
      <div className="login-deco-card" style={{"--rot":"13deg","--dur":"7.5s","--delay":"-3.5s",top:"75%",left:"25%",borderTop:"3px solid rgba(132,204,22,0.7)"}}>
        <div className="deco-title" style={{background:"rgba(132,204,22,0.5)"}}/>
        <div className="deco-line" style={{width:"76%"}}/>
        <div className="deco-line" style={{width:"52%"}}/>
        <div className="deco-line" style={{width:"68%"}}/>
      </div>
      {/* Colonne centre */}
      <div className="login-deco-card" style={{"--rot":"-4deg","--dur":"11s","--delay":"-0.5s",top:"4%",left:"44%",borderTop:"3px solid rgba(236,72,153,0.7)"}}>
        <div className="deco-title" style={{background:"rgba(236,72,153,0.5)"}}/>
        <div className="deco-line" style={{width:"90%"}}/>
        <div className="deco-line" style={{width:"70%"}}/>
      </div>
      <div className="login-deco-card" style={{"--rot":"9deg","--dur":"9s","--delay":"-8s",top:"80%",left:"48%",borderTop:"3px solid rgba(20,184,166,0.7)"}}>
        <div className="deco-title" style={{background:"rgba(20,184,166,0.5)"}}/>
        <div className="deco-line" style={{width:"74%"}}/>
        <div className="deco-line" style={{width:"88%"}}/>
        <div className="deco-line" style={{width:"55%"}}/>
      </div>
      {/* Colonne centre-droite */}
      <div className="login-deco-card" style={{"--rot":"-9deg","--dur":"10.5s","--delay":"-2.5s",top:"10%",left:"65%",borderTop:"3px solid rgba(244,63,94,0.7)"}}>
        <div className="deco-title" style={{background:"rgba(244,63,94,0.5)"}}/>
        <div className="deco-line" style={{width:"76%"}}/>
        <div className="deco-line" style={{width:"92%"}}/>
        <div className="deco-line" style={{width:"55%"}}/>
      </div>
      <div className="login-deco-card" style={{"--rot":"7deg","--dur":"8s","--delay":"-7s",top:"44%",left:"63%",borderTop:"3px solid rgba(99,102,241,0.7)"}}>
        <div className="deco-title" style={{background:"rgba(99,102,241,0.5)"}}/>
        <div className="deco-line" style={{width:"80%"}}/>
        <div className="deco-line" style={{width:"62%"}}/>
      </div>
      <div className="login-deco-card" style={{"--rot":"-11deg","--dur":"9s","--delay":"-4.5s",top:"73%",left:"67%",borderTop:"3px solid rgba(168,85,247,0.7)"}}>
        <div className="deco-title" style={{background:"rgba(168,85,247,0.5)"}}/>
        <div className="deco-line" style={{width:"85%"}}/>
        <div className="deco-line" style={{width:"60%"}}/>
        <div className="deco-line" style={{width:"72%"}}/>
      </div>
      {/* Colonne droite */}
      <div className="login-deco-card" style={{"--rot":"6deg","--dur":"10s","--delay":"-1s",top:"6%",right:"3%",borderTop:"3px solid rgba(16,185,129,0.7)"}}>
        <div className="deco-title" style={{background:"rgba(16,185,129,0.5)"}}/>
        <div className="deco-line" style={{width:"88%"}}/>
        <div className="deco-line" style={{width:"70%"}}/>
      </div>
      <div className="login-deco-card" style={{"--rot":"-8deg","--dur":"7.5s","--delay":"-3s",top:"35%",right:"2%",borderTop:"3px solid rgba(245,158,11,0.7)"}}>
        <div className="deco-title" style={{background:"rgba(245,158,11,0.5)"}}/>
        <div className="deco-line" style={{width:"90%"}}/>
        <div className="deco-line" style={{width:"60%"}}/>
        <div className="deco-line" style={{width:"78%"}}/>
      </div>
      <div className="login-deco-card" style={{"--rot":"-15deg","--dur":"11s","--delay":"-5s",top:"62%",right:"4%",borderTop:"3px solid rgba(249,115,22,0.7)"}}>
        <div className="deco-title" style={{background:"rgba(249,115,22,0.5)"}}/>
        <div className="deco-line" style={{width:"75%"}}/>
        <div className="deco-line" style={{width:"50%"}}/>
      </div>
      <div className="login-deco-card" style={{"--rot":"4deg","--dur":"8s","--delay":"-9s",top:"85%",right:"6%",borderTop:"3px solid rgba(14,165,233,0.7)"}}>
        <div className="deco-title" style={{background:"rgba(14,165,233,0.5)"}}/>
        <div className="deco-line" style={{width:"82%"}}/>
        <div className="deco-line" style={{width:"66%"}}/>
        <div className="deco-line" style={{width:"50%"}}/>
      </div>
    </div>
  );
}
