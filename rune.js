const runeInput = document.querySelector("#rune-input");
const englishOutput = document.querySelector("#english-output");
const runeCount = document.querySelector("#rune-count");
const keyboard = document.querySelector("#rune-keyboard");
const keyboardToggle = document.querySelector("#keyboard-toggle");
const keyboardHide = document.querySelector("#keyboard-hide");
const capsToggle = document.querySelector("#caps-toggle");
const runeStatus = document.querySelector("#rune-status");
let isUppercase = false;

for (const row of document.querySelectorAll(".key-row[data-keys]")) {
  for (const letter of row.dataset.keys) {
    const key = document.createElement("button");
    key.className = "rune-key letter-key";
    key.type = "button";
    key.dataset.letter = letter;
    key.setAttribute("aria-label", `输入 ${letter.toUpperCase()}`);
    key.innerHTML = `<span class="rune-glyph">${letter}</span><span class="key-label">${letter.toUpperCase()}</span>`;
    row.append(key);
  }
}

function syncTranslation() {
  const text = runeInput.value;
  englishOutput.value = text;
  runeCount.value = `${Array.from(text).length} 字`;
  runeCount.textContent = runeCount.value;
}

function insertText(text) {
  const start = runeInput.selectionStart;
  const end = runeInput.selectionEnd;
  runeInput.setRangeText(text, start, end, "end");
  runeInput.focus();
  syncTranslation();
}

function setKeyboardVisible(visible) {
  keyboard.hidden = !visible;
  keyboardToggle.setAttribute("aria-expanded", String(visible));
}

runeInput.addEventListener("input", syncTranslation);

document.querySelector(".virtual-keyboard").addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;

  if (button.dataset.letter) {
    insertText(isUppercase ? button.dataset.letter.toUpperCase() : button.dataset.letter);
    return;
  }

  switch (button.dataset.action) {
    case "caps":
      setUppercase(!isUppercase);
      break;
    case "space":
      insertText(" ");
      break;
    case "period":
      insertText(".");
      break;
    case "enter":
      insertText("\n");
      break;
    case "backspace": {
      const start = runeInput.selectionStart;
      const end = runeInput.selectionEnd;
      if (start !== end) {
        runeInput.setRangeText("", start, end, "end");
      } else if (start > 0) {
        const previous = Array.from(runeInput.value.slice(0, start)).pop();
        runeInput.setRangeText("", start - (previous ? previous.length : 0), start, "end");
      }
      runeInput.focus();
      syncTranslation();
      break;
    }
  }
});

function setUppercase(value) {
  isUppercase = value;
  capsToggle.setAttribute("aria-pressed", String(value));
  capsToggle.textContent = value ? "ABC" : "abc";
  document.querySelectorAll(".letter-key").forEach((key) => {
    const letter = key.dataset.letter;
    const glyph = key.querySelector(".rune-glyph");
    const label = key.querySelector(".key-label");
    glyph.textContent = value ? letter.toUpperCase() : letter;
    label.textContent = value ? letter : letter.toUpperCase();
    key.setAttribute("aria-label", `输入 ${value ? letter : letter.toUpperCase()}`);
  });
}

keyboardToggle.addEventListener("click", () => setKeyboardVisible(keyboard.hidden));
keyboardHide.addEventListener("click", () => setKeyboardVisible(false));
capsToggle.addEventListener("click", () => setUppercase(!isUppercase));

document.querySelector("#clear-all").addEventListener("click", () => {
  runeInput.value = "";
  runeStatus.textContent = "";
  syncTranslation();
  runeInput.focus();
});

document.querySelector("#copy-english").addEventListener("click", async () => {
  if (!englishOutput.value) {
    runeStatus.textContent = "当前没有可复制的英文内容。";
    return;
  }
  try {
    await navigator.clipboard.writeText(englishOutput.value);
    runeStatus.textContent = "英文结果已复制。";
  } catch {
    englishOutput.focus();
    englishOutput.select();
    runeStatus.textContent = "无法自动访问剪贴板，已选中英文结果，请手动复制。";
  }
});

setUppercase(false);
syncTranslation();
