const homeScreenEl = document.getElementById("home-screen");
const resultsScreenEl = document.getElementById("results-screen");
const homeFormEl = document.getElementById("home-form");
const homeQueryEl = document.getElementById("home-query");
const homeRandomQuestionBtn = document.getElementById("home-random-question-btn");
const homeSearchBtn = document.getElementById("home-search-btn");
const resultsTopFormEl = document.getElementById("results-top-form");
const resultsQueryEl = document.getElementById("results-query");
const resultsSearchBtn = document.getElementById("results-search-btn");
const errorBannerEl = document.getElementById("error-banner");
const sourceResultsEl = document.getElementById("source-results");
const gridEl = document.getElementById("grid");
const metaEl = document.getElementById("meta");
const aiOverviewEl = document.getElementById("ai-overview");
const aiAnswerEl = document.getElementById("ai-answer");
const aiHistoryEl = document.getElementById("ai-history");
const followupFormEl = document.getElementById("followup-form");
const followupInputEl = document.getElementById("followup-input");
const followupSendBtn = document.getElementById("followup-send-btn");
const template = document.getElementById("card-template");
const productModalEl = document.getElementById("product-modal");
const productModalBackdropBtn = document.getElementById("product-modal-backdrop");
const productModalCloseBtn = document.getElementById("product-modal-close-btn");
const productModalTitleEl = document.getElementById("product-modal-title");
const productModalPriceEl = document.getElementById("product-modal-price");
const productModalRatingEl = document.getElementById("product-modal-rating");
const productModalDescriptionEl = document.getElementById("product-modal-description");
const homeExampleCardEl = document.getElementById("home-example-card");
const resultsExampleCardEl = document.getElementById("results-example-card");

let chatConversationUuid = null;
let aiConversation = [];
let exampleBank = [];
let activeExample = null;
let activeExampleQuestion = null;

function showError(message) {
  errorBannerEl.textContent = message;
  errorBannerEl.classList.remove("hidden");
  errorBannerEl.hidden = false;
}

function clearError() {
  errorBannerEl.textContent = "";
  errorBannerEl.classList.add("hidden");
  errorBannerEl.hidden = true;
}

function chooseRandom(items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function sameDocumentId(left, right) {
  const a = String(left || "").trim();
  const b = String(right || "").trim();
  return Boolean(a && b && a === b);
}

function isExactActiveExampleSource(comment) {
  return sameDocumentId(comment?.document_id || comment?.id, activeExample?.document?.document_id);
}

function isTextActiveExampleSource(comment) {
  const referenceContent = String(activeExample?.document?.content || "").trim();
  const sourceContent = String(comment?.description || comment?.text || comment?.content || "").trim();
  if (referenceContent.length < 80 || sourceContent.length < 80) return false;
  const referencePrefix = referenceContent.slice(0, 160);
  const sourcePrefix = sourceContent.slice(0, 160);
  return referenceContent.includes(sourcePrefix) || sourceContent.includes(referencePrefix);
}

function findActiveExampleSourceIndex(items) {
  if (!activeExample?.document || !Array.isArray(items) || items.length === 0) {
    return -1;
  }

  const exactIndex = items.findIndex(isExactActiveExampleSource);
  if (exactIndex >= 0) {
    return exactIndex;
  }

  return items.findIndex(isTextActiveExampleSource);
}

function setResultsVisible(isVisible) {
  homeScreenEl.classList.toggle("hidden", isVisible);
  homeScreenEl.hidden = isVisible;
  resultsScreenEl.classList.toggle("hidden", !isVisible);
  resultsScreenEl.hidden = !isVisible;
}

function setAiVisible(isVisible) {
  aiOverviewEl.classList.toggle("hidden", !isVisible);
  aiOverviewEl.hidden = !isVisible;
  if (!isVisible) {
    setFollowupVisible(false);
  }
}

function setFollowupVisible(isVisible) {
  followupFormEl.classList.toggle("hidden", !isVisible);
  followupFormEl.hidden = !isVisible;
}

function sqlQuote(value) {
  return `'${String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

function buildChatSql(message) {
  return `CALL CHAT(${[
    sqlQuote(message),
    sqlQuote("fiqa_docs"),
    sqlQuote("assistant"),
    sqlQuote(chatConversationUuid || ""),
    sqlQuote("embedding_vector"),
  ].join(", ")})`;
}

function renderAiConversation({ loadingQuestion = "", transientTurn = null } = {}) {
  aiHistoryEl.innerHTML = "";

  for (const turn of aiConversation) {
    const article = document.createElement("article");
    article.className = "ai-turn";

    const question = document.createElement("p");
    question.className = "ai-question";
    question.textContent = turn.question;
    article.appendChild(question);

    const answer = document.createElement("div");
    answer.className = "ai-answer";
    answer.innerHTML = markdownToHtml(turn.answer || "No AI answer was returned.");
    article.appendChild(answer);

    aiHistoryEl.appendChild(article);
  }

  if (loadingQuestion) {
    const article = document.createElement("article");
    article.className = "ai-turn loading";

    const question = document.createElement("p");
    question.className = "ai-question";
    question.textContent = loadingQuestion;
    article.appendChild(question);

    const answer = document.createElement("div");
    answer.className = "ai-answer";
    const sql = buildChatSql(loadingQuestion);
    answer.innerHTML = `
      <p>Executing SQL request:</p>
      <pre class="chat-sql"><code>${escapeHtml(sql)}</code></pre>
    `;
    article.appendChild(answer);

    aiHistoryEl.appendChild(article);
  }

  if (transientTurn) {
    const article = document.createElement("article");
    article.className = "ai-turn";

    const question = document.createElement("p");
    question.className = "ai-question";
    question.textContent = transientTurn.question;
    article.appendChild(question);

    const answer = document.createElement("div");
    answer.className = "ai-answer";
    answer.innerHTML = markdownToHtml(transientTurn.answer || "No AI answer was returned.");
    article.appendChild(answer);

    aiHistoryEl.appendChild(article);
  }
}

function clearAiConversation() {
  aiConversation = [];
  aiHistoryEl.innerHTML = "";
  aiAnswerEl.innerHTML = "";
  aiAnswerEl.classList.add("hidden");
  aiAnswerEl.hidden = true;
  setFollowupVisible(false);
}

function setAiOverview(text, { loading = false, question = "", transient = false } = {}) {
  aiOverviewEl.classList.toggle("loading", loading);
  if (loading) {
    renderAiConversation({ loadingQuestion: question });
    setFollowupVisible(aiConversation.length > 0);
    return;
  }

  const cleanText = String(text || "").trim();
  if (question) {
    if (transient) {
      renderAiConversation({
        transientTurn: {
          question,
          answer: cleanText || "No AI answer was returned.",
        },
      });
      setFollowupVisible(aiConversation.length > 0);
      return;
    }
    aiConversation.push({
      question,
      answer: cleanText || "No AI answer was returned.",
    });
  }
  renderAiConversation();
  setFollowupVisible(aiConversation.length > 0);
}

async function readErrorMessage(response, fallback) {
  try {
    const payload = await response.json();
    const detail = payload.detail || payload.error || payload.message;
    if (Array.isArray(detail)) {
      return `${fallback}: ${detail.map((item) => item.msg || JSON.stringify(item)).join("; ")}`;
    }
    if (detail) {
      return `${fallback}: ${detail}`;
    }
  } catch (_) {
    // Response was not JSON; fall back to status text below.
  }
  return `${fallback}: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}`;
}

function setProductModalOpen(isOpen) {
  productModalEl.classList.toggle("hidden", !isOpen);
  productModalEl.hidden = !isOpen;
}

function setSourcesVisible(isVisible) {
  sourceResultsEl.classList.toggle("hidden", !isVisible);
  sourceResultsEl.hidden = !isVisible;
}

function setBusy(isBusy) {
  homeSearchBtn.disabled = isBusy;
  homeRandomQuestionBtn.disabled = isBusy;
  resultsQueryEl.disabled = isBusy;
  resultsSearchBtn.disabled = isBusy;
  followupInputEl.disabled = isBusy;
  followupSendBtn.disabled = isBusy;
  homeSearchBtn.textContent = isBusy ? "Searching..." : "Ask AI";
  resultsSearchBtn.textContent = isBusy ? "Searching..." : "Search";
  followupSendBtn.textContent = isBusy ? "…" : "↑";
}

function renderCommentModal(comment) {
  const body = String(comment.description || comment.text || "").trim();
  const headline = (comment.title || "").trim() || body.split(/(?<=[.!?])\s+/)[0] || "Comment";
  productModalTitleEl.textContent = headline.slice(0, 160);
  productModalPriceEl.textContent = comment.url ? `URL: ${comment.url}` : "URL: N/A";
  productModalRatingEl.textContent = `Comment ID: ${comment.document_id || comment.id || "N/A"}`;
  productModalDescriptionEl.textContent = body || "No comment text available.";
}

function renderExampleCard(targetEl, { compact = false } = {}) {
  if (!targetEl) return;
  const generateButtonText = compact
    ? "Step 2: Generate likely questions"
    : "Step 2: Generate likely questions that this text answers";
  if (!activeExample) {
    targetEl.innerHTML = `
      <h2>Loading a random FIQA document…</h2>
    `;
    return;
  }

  const doc = activeExample.document || {};
  const questions = Array.isArray(activeExample.questions) ? activeExample.questions : [];
  const questionButtons = questions
    .map((question, index) => {
      const isActive = question === activeExampleQuestion || question.text === activeExampleQuestion?.text;
      return `<button class="example-question${isActive ? " active" : ""}" type="button" data-question-index="${index}">${escapeHtml(question.text)}</button>`;
    })
    .join("");

  targetEl.innerHTML = `
    <div class="example-card-head">
      <button class="example-random-btn" type="button">Step 1: Pick a random document</button>
    </div>
    <article class="example-document">
      <p class="example-doc-meta">Document ID ${escapeHtml(doc.document_id || "N/A")}</p>
      <h3>${escapeHtml(doc.title || "FIQA document")}</h3>
      <p>${escapeHtml(doc.content || "")}</p>
    </article>
    <button class="example-generate-btn" type="button">${generateButtonText}</button>
    <div class="example-questions${activeExample.questionsVisible ? "" : " hidden"}">
      ${questionButtons}
    </div>
  `;

  targetEl.querySelector(".example-random-btn")?.addEventListener("click", () => setRandomExample());
  targetEl.querySelector(".example-generate-btn")?.addEventListener("click", () => {
    activeExample.questionsVisible = true;
    renderExampleCards();
  });
  targetEl.querySelectorAll(".example-question").forEach((button) => {
    button.addEventListener("click", () => selectExampleQuestion(Number(button.dataset.questionIndex || 0)));
  });
}

function renderExampleCards() {
  renderExampleCard(homeExampleCardEl);
  renderExampleCard(resultsExampleCardEl, { compact: true });
}

function setRandomExample() {
  activeExample = chooseRandom(exampleBank);
  if (activeExample) {
    activeExample.questionsVisible = false;
  }
  activeExampleQuestion = null;
  renderExampleCards();
  renderComments([]);
}

function pickRandomExampleQuestion() {
  const examplesWithQuestions = exampleBank.filter((example) => Array.isArray(example.questions) && example.questions.length > 0);
  const nextExample = chooseRandom(examplesWithQuestions) || activeExample;
  const questions = Array.isArray(nextExample?.questions) ? nextExample.questions : [];
  const nextQuestion = chooseRandom(questions);

  if (!nextExample || !nextQuestion?.text) {
    return null;
  }

  activeExample = nextExample;
  activeExample.questionsVisible = true;
  activeExampleQuestion = nextQuestion;
  homeQueryEl.value = nextQuestion.text;
  resultsQueryEl.value = nextQuestion.text;
  renderExampleCards();
  return nextQuestion;
}

function chooseRandomQuestionForHome() {
  const nextQuestion = pickRandomExampleQuestion();
  if (!nextQuestion) {
    setRandomExample();
    return;
  }
  renderComments([]);
}

async function loadExampleBank() {
  try {
    const response = await fetch("/static/example_questions.json?v=20260605p");
    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "Example loading failed"));
    }
    exampleBank = await response.json();
    chooseRandomQuestionForHome();
  } catch (error) {
    console.error("Example loading failed:", error);
    const message = `<h2>Example questions unavailable</h2><p class="example-hint">${escapeHtml(error.message || String(error))}</p>`;
    if (homeExampleCardEl) homeExampleCardEl.innerHTML = message;
    if (resultsExampleCardEl) resultsExampleCardEl.innerHTML = message;
  }
}

async function selectExampleQuestion(index) {
  if (!activeExample) return;
  activeExample.questionsVisible = true;
  activeExampleQuestion = activeExample.questions?.[index] || null;
  renderExampleCards();
  if (!activeExampleQuestion) return;
  await askAi({ message: activeExampleQuestion.text, resetConversation: true });
}

function normalizeChatSources(sources) {
  if (!Array.isArray(sources)) return [];

  return sources.map((source, index) => {
    const content = String(source.content || source.text || source.description || "").trim();
    const title = String(source.title || "").trim();
    const distance = source.knn_dist ?? source["@knn_dist"];
    return {
      id: source.id || index + 1,
      document_id: source.document_id || source.id || `chat-source-${index + 1}`,
      title: title || content.split(/(?<=[.!?])\s+/)[0] || "Retrieved comment",
      description: content,
      text: content,
      url: source.url || "",
      knn_dist: distance,
    };
  });
}

function renderComments(items) {
  gridEl.innerHTML = "";
  const visibleItems = Array.isArray(items) ? items : [];
  setSourcesVisible(visibleItems.length > 0);
  metaEl.textContent = visibleItems.length
    ? `${visibleItems.length} source${visibleItems.length === 1 ? "" : "s"}${activeExample?.document ? " · reference document is highlighted if retrieved" : ""}`
    : "";
  const referenceSourceIndex = findActiveExampleSourceIndex(visibleItems);

  for (const [index, comment] of visibleItems.entries()) {
    const node = template.content.cloneNode(true);
    const preview = String(comment.description || comment.text || "").trim();
    const headline = (comment.title || "").trim() || preview.split(/(?<=[.!?])\s+/)[0] || "Untitled comment";
    const shortPreview = preview.length > 280 ? `${preview.slice(0, 280)}...` : preview;
    const commentId = comment.document_id || comment.id || "N/A";

    const isReferenceSource = index === referenceSourceIndex;

    node.querySelector(".title").textContent = headline.slice(0, 160);
    const ratingEl = node.querySelector(".rating");
    ratingEl.textContent = isReferenceSource ? "Reference document" : "";
    ratingEl.hidden = !isReferenceSource;
    node.querySelector(".bought").textContent = `Comment ID ${commentId}`;
    node.querySelector(".color").textContent = `Comment: ${commentId}`;
    node.querySelector(".delivery").textContent = comment.url || "";
    node.querySelector(".description").textContent = shortPreview || "No text";

    const cardEl = node.querySelector(".card");
    cardEl.classList.add("clickable");
    if (isReferenceSource) {
      cardEl.classList.add("reference-source-card");
    }
    cardEl.addEventListener("click", () => {
      renderCommentModal(comment);
      setProductModalOpen(true);
    });

    gridEl.appendChild(node);
  }
}

async function callChat(message) {
  const response = await fetch("/api/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message,
      conversation_uuid: chatConversationUuid,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "CALL CHAT failed"));
  }

  return response.json();
}

async function askAi({ message = "", resetConversation = false } = {}) {
  const text = String(message || homeQueryEl.value || followupInputEl.value || "").trim();
  if (!text) return null;

  if (resetConversation) {
    chatConversationUuid = null;
    clearAiConversation();
  }

  homeQueryEl.value = text;
  resultsQueryEl.value = text;
  clearError();
  setResultsVisible(true);
  setAiVisible(true);
  setAiOverview("", { loading: true, question: text });
  renderComments([]);
  setBusy(true);

  try {
    const payload = await callChat(text);
    chatConversationUuid = payload.conversation_uuid || chatConversationUuid;
    const searchQuery = String(payload.search_query || "").trim();
    if (searchQuery) {
      resultsQueryEl.value = searchQuery;
    }
    setAiOverview((payload.response || "").trim() || "No AI answer was returned.", { question: text });

    const chatItems = Array.isArray(payload.items) ? payload.items : [];
    const chatSources = normalizeChatSources(payload.sources);
    renderComments(chatItems.length ? chatItems : chatSources);
    return payload;
  } catch (error) {
    console.error("CALL CHAT failed:", error);
    showError(error.message || String(error));
    setAiOverview("CALL CHAT is unavailable for this request.", { question: text, transient: true });
    renderComments([]);
    return null;
  } finally {
    aiOverviewEl.classList.remove("loading");
    setBusy(false);
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineMarkdown(value) {
  return value
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^\*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[^_])_([^_]+)_/g, "$1<em>$2</em>");
}

function markdownToHtml(markdown) {
  const input = String(markdown || "").replace(/\r\n/g, "\n").trim();
  if (!input) return "";

  const codeBlocks = [];
  const withPlaceholders = input.replace(/```([\w-]+)?\n?([\s\S]*?)```/g, (_, lang, body) => {
    const languageClass = lang ? ` class="language-${escapeHtml(lang)}"` : "";
    const html = `<pre><code${languageClass}>${escapeHtml(body)}</code></pre>`;
    const token = `@@CODE_BLOCK_${codeBlocks.length}@@`;
    codeBlocks.push(html);
    return token;
  });

  const lines = withPlaceholders.split("\n");
  const html = [];
  let inUl = false;
  let inOl = false;

  const closeLists = () => {
    if (inUl) {
      html.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      html.push("</ol>");
      inOl = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeLists();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeLists();
      const level = heading[1].length;
      html.push(`<h${level}>${renderInlineMarkdown(escapeHtml(heading[2]))}</h${level}>`);
      continue;
    }

    const ulItem = line.match(/^[-*+]\s+(.+)$/);
    if (ulItem) {
      if (inOl) {
        html.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        html.push("<ul>");
        inUl = true;
      }
      html.push(`<li>${renderInlineMarkdown(escapeHtml(ulItem[1]))}</li>`);
      continue;
    }

    const olItem = line.match(/^\d+\.\s+(.+)$/);
    if (olItem) {
      if (inUl) {
        html.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        html.push("<ol>");
        inOl = true;
      }
      html.push(`<li>${renderInlineMarkdown(escapeHtml(olItem[1]))}</li>`);
      continue;
    }

    closeLists();
    html.push(`<p>${renderInlineMarkdown(escapeHtml(line))}</p>`);
  }

  closeLists();
  let rendered = html.join("");
  for (let i = 0; i < codeBlocks.length; i += 1) {
    rendered = rendered.replace(`@@CODE_BLOCK_${i}@@`, codeBlocks[i]);
  }
  return rendered;
}

async function submitFollowup(inputEl) {
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = "";
  inputEl.style.height = "auto";
  await askAi({ message: text });
  inputEl.focus();
}

function resizeFollowup() {
  followupInputEl.style.height = "auto";
  followupInputEl.style.height = `${Math.min(followupInputEl.scrollHeight, 160)}px`;
}

homeFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  activeExampleQuestion = null;
  renderExampleCards();
  askAi({ resetConversation: true });
});
homeRandomQuestionBtn.addEventListener("click", chooseRandomQuestionForHome);
resultsTopFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  activeExampleQuestion = null;
  renderExampleCards();
  askAi({ message: resultsQueryEl.value, resetConversation: true });
});
followupFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  submitFollowup(followupInputEl);
});
followupInputEl.addEventListener("input", resizeFollowup);
followupInputEl.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    submitFollowup(followupInputEl);
  }
});
productModalBackdropBtn.addEventListener("click", () => setProductModalOpen(false));
productModalCloseBtn.addEventListener("click", () => setProductModalOpen(false));
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !productModalEl.classList.contains("hidden")) {
    setProductModalOpen(false);
  }
});

setResultsVisible(false);
setAiVisible(false);
clearAiConversation();
renderComments([]);
setProductModalOpen(false);
loadExampleBank();
