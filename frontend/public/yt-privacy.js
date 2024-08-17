let youtubeAllowed = window.localStorage.getItem("allow-youtube") == "true";

for (let f of document.querySelectorAll("iframe.youtube")) {
  upgradeFrame(f);
}

/**
 * @param {HTMLIFrameElement} iframe
 */
function upgradeFrame(iframe) {
  if (youtubeAllowed) {
    iframe.src = iframe.getAttribute("data-url");
  } else {
    let placeholder = document.createElement("div");
    placeholder.className = "youtube-embed-placeholder";
	let p = document.createElement("p");
    p.textContent = "Allow embedded YouTube player?";
	placeholder.appendChild(p);
    let buttons = [
      [
        "Yes, always",
        () => {
          window.localStorage.setItem("allow-youtube", "true");
          window.location.reload();
        },
      ],
      [
        "Only once",
        () => {
          iframe.src = iframe.getAttribute("data-url");
          placeholder.replaceWith(iframe);
        },
      ],
    ];
    for (const button of buttons) {
      let dom = document.createElement("button");
      dom.textContent = button[0];
      dom.onclick = button[1];
      placeholder.appendChild(dom);
    }
    iframe.replaceWith(placeholder);
  }
}

if (youtubeAllowed) {
  let rejectButton = document.createElement("a");
  rejectButton.className = "yt-embed-reject";
  rejectButton.textContent = "Stop embedding YouTube";
  rejectButton.href = "#";
  rejectButton.onclick = (e) => {
    e.preventDefault();
    window.localStorage.removeItem("allow-youtube");
    window.location.reload();
    return false;
  };
  document.body.appendChild(rejectButton);
}
