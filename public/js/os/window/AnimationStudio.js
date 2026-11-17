function openAnimationStudio() {
 if (typeof closeLauncher==="function") closeLauncher();
 const html = `
 <div class="AppPanel animation-studio">
  <header class="as-header"><div><span class="as-eyebrow">MOTION DESIGNER</span><h2>Animation Studio</h2><p>Author keyframes, tune timing, and preview motion on desktop elements.</p></div><span class="as-live-dot">LIVE PREVIEW</span></header>
  <div class="as-layout"><section class="as-editor">
   <div class="as-section-title"><strong>Keyframes CSS</strong><span>CSS @keyframes</span></div>
   <textarea id="as-keyframes" spellcheck="false" aria-label="CSS keyframes editor"></textarea>
   <div class="as-controls"><label>Target selector<input id="as-target" value=".window-shell" spellcheck="false"></label>
    <div class="as-control-grid">
     <label>Duration (ms)<input id="as-duration" type="number" min="80" max="12000" step="50" value="700"></label>
     <label>Delay (ms)<input id="as-delay" type="number" min="0" max="10000" step="50" value="0"></label>
     <label>Easing<select id="as-easing"><option>cubic-bezier(.2,.8,.2,1)</option><option>ease</option><option>ease-in</option><option>ease-out</option><option>ease-in-out</option><option>linear</option></select></label>
     <label>Iterations<select id="as-iterations"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="infinite">Infinite</option></select></label>
     <label>Direction<select id="as-direction"><option value="normal">Normal</option><option value="reverse">Reverse</option><option value="alternate">Alternate</option></select></label>
     <label>Fill mode<select id="as-fill"><option value="both">Both</option><option value="forwards">Forwards</option><option value="backwards">Backwards</option><option value="none">None</option></select></label>
    </div>
   </div>
   <div class="as-actions"><button type="button" id="as-play">▶ Preview target</button><button type="button" id="as-stop" class="as-secondary">Stop</button><button type="button" id="as-apply" class="as-secondary">Apply to target</button><button type="button" id="as-save" class="as-secondary">Save preset</button></div>
   <div class="as-presets"><label>Presets<select id="as-preset"><option value="float">Soft float</option><option value="pop">Pop in</option><option value="shimmer">Shimmer</option><option value="pulse">Pulse</option><option value="custom">Saved custom</option></select></label><button type="button" id="as-load" class="as-secondary">Load</button></div>
   <p id="as-status" class="as-status" role="status">Ready. Try a preset or edit the keyframes.</p>
  </section><aside class="as-preview"><div class="as-section-title"><strong>Preview canvas</strong><span>Sample</span></div><div class="as-stage"><div id="as-preview-card" class="as-preview-card"><span>W</span><strong>WebOS</strong><small>Motion in progress</small></div></div><div class="as-tip"><strong>Tip</strong><p>Try selectors like <code>.window-shell</code>, <code>#dock</code>, or <code>.TaskButton</code>. Applying affects matching desktop elements until changed or reloaded.</p></div><div class="as-warning">Experimental: presets are stored locally and respect Reduce Motion.</div></aside></div>
 </div>`;
 const win=createWindow("Animation Studio",html); if(!win)return null;
 win.style.width=Math.min(window.innerWidth-36,1060)+"px";win.style.height=Math.min(window.innerHeight-100,760)+"px";
 const $=id=>win.querySelector("#"+id), editor=$("as-keyframes"),target=$("as-target"),status=$("as-status"),preview=$("as-preview-card");
 const duration=$("as-duration"),delay=$("as-delay"),easing=$("as-easing"),iterations=$("as-iterations"),direction=$("as-direction"),fill=$("as-fill");
 let style=document.getElementById("webos-animation-studio-style");if(!style){style=document.createElement("style");style.id="webos-animation-studio-style";document.head.appendChild(style);}
 const samples={
  float:"@keyframes webos-studio-motion {\n  0% { transform: translateY(0) rotate(0); }\n  50% { transform: translateY(-18px) rotate(-2deg); }\n  100% { transform: translateY(0) rotate(0); }\n}",
  pop:"@keyframes webos-studio-motion {\n  0% { opacity: 0; transform: translateY(24px) scale(.82); }\n  70% { opacity: 1; transform: translateY(-4px) scale(1.03); }\n  100% { opacity: 1; transform: translateY(0) scale(1); }\n}",
  shimmer:"@keyframes webos-studio-motion {\n  0% { filter: brightness(.85) saturate(1); }\n  50% { filter: brightness(1.45) saturate(1.5); }\n  100% { filter: brightness(.85) saturate(1); }\n}",
  pulse:"@keyframes webos-studio-motion {\n  0%,100% { transform: scale(1); opacity: 1; }\n  50% { transform: scale(1.07); opacity: .78; }\n}"
 };
 editor.value=samples.float;
 function validate(){const css=editor.value.trim();if(!/@keyframes\s+webos-studio-motion\b/i.test(css))throw Error("Keep the keyframe name webos-studio-motion.");if(/@import|javascript:|expression\s*\(/i.test(css))throw Error("Unsafe CSS token detected.");const sheet=new CSSStyleSheet();sheet.replaceSync(css);if(!Array.from(sheet.cssRules).some(rule=>rule.type===CSSRule.KEYFRAMES_RULE))throw Error("No valid @keyframes rule found.");style.textContent=css;}
 function options(){return{duration:Math.max(80,Math.min(12000,Number(duration.value)||700)),delay:Math.max(0,Math.min(10000,Number(delay.value)||0)),easing:easing.value,iterations:iterations.value==="infinite"?Infinity:Number(iterations.value),direction:direction.value,fill:fill.value};}
 function animate(element){const o=options();element.style.animation="none";void element.offsetWidth;element.style.animation="webos-studio-motion "+o.duration+"ms "+o.easing+" "+o.delay+"ms "+o.iterations+" "+o.direction+" "+o.fill;}
 $("as-play").onclick=()=>{try{validate();animate(preview);let el;try{el=document.querySelector(target.value.trim());}catch(_){throw Error("Invalid target selector.");}if(el&&!win.contains(el))animate(el);status.textContent="Preview running on sample and first matching target.";}catch(e){status.textContent="Preview failed: "+e.message;}};
 $("as-stop").onclick=()=>{preview.style.animation="none";try{document.querySelectorAll(target.value.trim()).forEach(el=>{if(!win.contains(el))el.style.animation="";});}catch(_){}status.textContent="Animation stopped.";};
 $("as-apply").onclick=()=>{try{validate();const nodes=Array.from(document.querySelectorAll(target.value.trim())).filter(el=>!win.contains(el));if(!nodes.length)throw Error("No matching desktop elements.");nodes.forEach(animate);status.textContent="Applied to "+nodes.length+" matching element(s).";}catch(e){status.textContent="Apply failed: "+e.message;}};
 $("as-save").onclick=()=>{try{validate();localStorage.setItem("webos-animation-preset",JSON.stringify({css:editor.value,duration:duration.value,delay:delay.value,easing:easing.value,iterations:iterations.value,direction:direction.value,fill:fill.value}));status.textContent="Custom preset saved on this device.";}catch(e){status.textContent="Save failed: "+e.message;}};
 $("as-load").onclick=()=>{const name=$("as-preset").value;if(name==="custom"){try{const v=JSON.parse(localStorage.getItem("webos-animation-preset")||"null");if(!v)throw Error("No custom preset saved.");editor.value=v.css;duration.value=v.duration;delay.value=v.delay;easing.value=v.easing;iterations.value=v.iterations;direction.value=v.direction;fill.value=v.fill;}catch(e){status.textContent=e.message;}}else editor.value=samples[name]||samples.float;};
 win.addEventListener("webos:window-close",()=>{preview.style.animation="none";});
 return win;
}