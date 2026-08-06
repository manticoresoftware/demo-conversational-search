const homeScreenEl = document.getElementById("home-screen");
const resultsScreenEl = document.getElementById("results-screen");
const homeFormEl = document.getElementById("home-form");
const homeQueryEl = document.getElementById("home-query");
const homeCustomPromptEl = document.getElementById("home-custom-prompt");
const homeRandomQuestionBtn = document.getElementById("home-random-question-btn");
const homeSearchBtn = document.getElementById("home-search-btn");
const resultsTopFormEl = document.getElementById("results-top-form");
const resultsQueryEl = document.getElementById("results-query");
const resultsCustomPromptEl = document.getElementById("results-custom-prompt");
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
const productModalImageEl = document.getElementById("product-modal-image");
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
let currentVisibleSources = [];
let referencePreviewEl = null;
let referencePreviewHideTimer = null;
let activeCustomPrompt = "";
const chatModelName = "assistant_gpt41mini";

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

function stableNumber(value, min, max) {
  const text = String(value || "product");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return min + (hash % (max - min + 1));
}

function productPrice(product) {
  return `$${stableNumber(product?.item_id || product?.document_id || product?.id || product?.title, 24, 189)}.99`;
}

function productRating(product) {
  const tenths = stableNumber(product?.item_id || product?.document_id || product?.id || product?.title, 38, 49);
  const reviews = stableNumber(`${product?.item_id || product?.document_id || product?.title}-reviews`, 84, 2400);
  return `★ ${(tenths / 10).toFixed(1)} · ${reviews.toLocaleString()} reviews`;
}

function productImageUrl(product) {
  return product?.image_url || product?.url || "";
}

function sameDocumentId(left, right) {
  const a = String(left || "").trim();
  const b = String(right || "").trim();
  return Boolean(a && b && a === b);
}

function isExactActiveExampleSource(comment) {
  return sameDocumentId(comment?.item_id || comment?.document_id || comment?.id, activeExample?.document?.document_id);
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

function currentCustomPrompt() {
  return String(activeCustomPrompt || "").trim();
}

function syncCustomPrompt(value, sourceEl = null) {
  activeCustomPrompt = String(value || "");
  for (const promptEl of [homeCustomPromptEl, resultsCustomPromptEl]) {
    if (promptEl && promptEl !== sourceEl && promptEl.value !== activeCustomPrompt) {
      promptEl.value = activeCustomPrompt;
    }
  }
}

function buildChatSql(message) {
  const model = currentCustomPrompt() ? `${chatModelName}_<prompt-sha256-prefix>` : chatModelName;
  return `CALL CHAT(${[
    sqlQuote(message),
    sqlQuote("convapparel_products"),
    sqlQuote(model),
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
    answer.innerHTML = answerToHtml(turn.answer || "No AI answer was returned.", turn.sources || []);
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
    answer.innerHTML = answerToHtml(transientTurn.answer || "No AI answer was returned.", transientTurn.sources || []);
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

function setAiOverview(text, { loading = false, question = "", transient = false, sources = [] } = {}) {
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
          sources,
        },
      });
      setFollowupVisible(aiConversation.length > 0);
      return;
    }
    aiConversation.push({
      question,
      answer: cleanText || "No AI answer was returned.",
      sources,
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
  if (homeCustomPromptEl) {
    homeCustomPromptEl.disabled = isBusy;
  }
  resultsCustomPromptEl.disabled = isBusy;
  resultsSearchBtn.disabled = isBusy;
  followupInputEl.disabled = isBusy;
  followupSendBtn.disabled = isBusy;
  homeSearchBtn.textContent = isBusy ? "…" : "↑";
  resultsSearchBtn.textContent = isBusy ? "…" : "↑";
  followupSendBtn.textContent = isBusy ? "…" : "↑";
}

function resizeTextarea(textarea, maxHeight = 160) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
}

function resizeQueryTextareas() {
  resizeTextarea(homeQueryEl, 180);
  resizeTextarea(resultsQueryEl, 150);
}

function renderCommentModal(comment) {
  const body = String(comment.description || comment.text || "").trim();
  const headline = (comment.title || "").trim() || body.split(/(?<=[.!?])\s+/)[0] || "Product";
  const imageUrl = productImageUrl(comment);
  productModalTitleEl.textContent = headline.slice(0, 160);
  productModalImageEl.src = imageUrl;
  productModalImageEl.alt = headline;
  productModalImageEl.hidden = !imageUrl;
  productModalPriceEl.textContent = productPrice(comment);
  productModalRatingEl.textContent = `${productRating(comment)} · Product ID: ${comment.item_id || comment.document_id || comment.id || "N/A"}`;
  productModalDescriptionEl.textContent = body || "No product description available.";
}

function renderExampleCard(targetEl, { compact = false } = {}) {
  if (!targetEl) return;
  const titleText = compact ? "Can search find this product?" : "Can search find this product?";
  const hintText = compact
    ? "A real catalog item plus a shopper request that should retrieve it."
    : "Here is a real catalog item and a natural shopper request that should retrieve it.";
  if (!activeExample) {
    targetEl.innerHTML = `
      <h2>Loading a random ConvApparel product…</h2>
    `;
    return;
  }

  const doc = activeExample.document || {};
  const questions = Array.isArray(activeExample.questions) ? activeExample.questions : [];
  const queryCards = questions
    .map((question, index) => {
      const isActive = question === activeExampleQuestion || question.text === activeExampleQuestion?.text;
      return `<button class="example-query-text${isActive ? " active" : ""}" type="button" data-question-index="${index}">${escapeHtml(question.text)}</button>`;
    })
    .join("");
  const firstQuestionIndex = questions.length ? 0 : -1;

  targetEl.innerHTML = `
    <div class="example-card-head">
      <div>
        <h2>${titleText}</h2>
        <p class="example-hint">${hintText}</p>
      </div>
    </div>
    <div class="example-search-pair">
      <article class="example-document">
        ${doc.image_url ? `<img class="example-product-image" src="${escapeHtml(doc.image_url)}" alt="${escapeHtml(doc.title || "ConvApparel product")}" />` : ""}
        <div class="example-product-copy">
          <p class="example-doc-meta">Product ID ${escapeHtml(doc.document_id || "N/A")}${doc.category ? ` · ${escapeHtml(doc.category)}` : ""}</p>
          <h3>${escapeHtml(doc.title || "ConvApparel product")}</h3>
          <p>${escapeHtml(doc.content || "")}</p>
        </div>
      </article>
      <section class="example-request-panel" aria-label="Shopper request for this product">
        <div class="example-query-label">Shopper request</div>
        <div class="example-questions">
          ${queryCards}
        </div>
        <div class="example-actions">
          <button class="example-random-btn" type="button" aria-label="Show another product" title="Show another product">🎲</button>
          <button class="example-use-btn" type="button" data-question-index="${firstQuestionIndex}"${firstQuestionIndex < 0 ? " disabled" : ""}>Search with this request</button>
        </div>
      </section>
    </div>
  `;

  targetEl.querySelector(".example-random-btn")?.addEventListener("click", () => setRandomExample());
  targetEl.querySelector(".example-use-btn")?.addEventListener("click", (event) => {
    selectExampleQuestion(Number(event.currentTarget.dataset.questionIndex || 0));
  });
  targetEl.querySelectorAll(".example-query-text").forEach((button) => {
    button.addEventListener("click", () => selectExampleQuestion(Number(button.dataset.questionIndex || 0)));
  });
}

function renderExampleCards() {
  renderExampleCard(homeExampleCardEl);
  renderExampleCard(resultsExampleCardEl, { compact: true });
}

function setRandomExample() {
  const examplesWithQuestions = exampleBank.filter((example) => Array.isArray(example.questions) && example.questions.length > 0);
  activeExample = chooseRandom(examplesWithQuestions) || chooseRandom(exampleBank);
  const questions = Array.isArray(activeExample?.questions) ? activeExample.questions : [];
  activeExampleQuestion = chooseRandom(questions) || null;
  if (activeExampleQuestion?.text) {
    homeQueryEl.value = activeExampleQuestion.text;
    resultsQueryEl.value = activeExampleQuestion.text;
    resizeQueryTextareas();
  }
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
  activeExampleQuestion = nextQuestion;
  homeQueryEl.value = nextQuestion.text;
  resultsQueryEl.value = nextQuestion.text;
  resizeQueryTextareas();
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
    const response = await fetch("/static/example_questions.json?v=20260618ecom");
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
    const sourceId = String(source.id || index + 1).trim();
    const itemId = String(source.item_id || source.document_id || "").trim();
    return {
      id: sourceId,
      item_id: itemId,
      document_id: itemId || sourceId || `chat-source-${index + 1}`,
      title: title || content.split(/(?<=[.!?])\s+/)[0] || "Retrieved product",
      description: content,
      text: content,
      url: source.image_url || source.url || "",
      image_url: source.image_url || "",
      features: source.features || "",
      category: source.category || "",
      knn_dist: distance,
    };
  });
}

function renderComments(items) {
  gridEl.innerHTML = "";
  const visibleItems = Array.isArray(items) ? items : [];
  currentVisibleSources = visibleItems;
  setSourcesVisible(visibleItems.length > 0);
  metaEl.textContent = visibleItems.length
    ? `${visibleItems.length} source${visibleItems.length === 1 ? "" : "s"}${activeExample?.document ? " · reference product is highlighted if retrieved" : ""}`
    : "";
  const referenceSourceIndex = findActiveExampleSourceIndex(visibleItems);

  for (const [index, comment] of visibleItems.entries()) {
    const node = template.content.cloneNode(true);
    const preview = String(comment.description || comment.text || "").trim();
    const headline = (comment.title || "").trim() || preview.split(/(?<=[.!?])\s+/)[0] || "Untitled product";
    const shortPreview = preview.length > 280 ? `${preview.slice(0, 280)}...` : preview;
    const commentId = comment.item_id || comment.document_id || comment.id || "N/A";
    const imageUrl = productImageUrl(comment);

    const isReferenceSource = index === referenceSourceIndex;

    const imageEl = node.querySelector(".product-image");
    const fallbackEl = node.querySelector(".image-fallback");
    if (imageUrl) {
      imageEl.src = imageUrl;
      imageEl.alt = headline;
      imageEl.hidden = false;
      fallbackEl.hidden = true;
    } else {
      imageEl.hidden = true;
      fallbackEl.hidden = false;
    }

    node.querySelector(".category-pill").textContent = comment.category || "apparel";
    node.querySelector(".title").textContent = headline.slice(0, 160);
    node.querySelector(".price").textContent = productPrice(comment);
    const ratingEl = node.querySelector(".rating");
    ratingEl.textContent = isReferenceSource ? `Reference product · ${productRating(comment)}` : productRating(comment);
    ratingEl.hidden = false;
    node.querySelector(".bought").textContent = `Product ID ${commentId}`;
    node.querySelector(".color").textContent = comment.category || `Product: ${commentId}`;
    node.querySelector(".delivery").textContent = comment.features || comment.url || "";
    node.querySelector(".description").textContent = shortPreview || "No product description";

    const cardEl = node.querySelector(".card");
    cardEl.classList.add("clickable");
    cardEl.dataset.sourceIndex = String(index + 1);
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
  const customPrompt = currentCustomPrompt();
  const body = {
    message,
    conversation_uuid: chatConversationUuid,
  };
  if (customPrompt) {
    body.custom_prompt = customPrompt;
  }

  const response = await fetch("/api/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
  resizeQueryTextareas();
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
      resizeTextarea(resultsQueryEl, 150);
    }
    const chatItems = Array.isArray(payload.items) ? payload.items : [];
    const chatSources = normalizeChatSources(payload.sources);
    const visibleSources = chatItems.length ? chatItems : chatSources;
    const answer = String(payload.response_with_refs || payload.response || "").trim() || "No AI answer was returned.";
    setAiOverview(answer, { question: text, sources: visibleSources });
    renderComments(visibleSources);
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

function sourceReferenceKeys(source) {
  return [source?.id, source?.item_id, source?.document_id]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
}

function sameReferenceKey(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  const numericLeft = /^\d{16,}$/.test(left);
  const numericRight = /^\d{16,}$/.test(right);
  if (!numericLeft || !numericRight) return false;
  return left.slice(0, 15) === right.slice(0, 15);
}

function findSourceReferenceIndex(rawReference, sources, { preferId = false } = {}) {
  const reference = String(rawReference || "").trim();
  if (!reference || !Array.isArray(sources) || sources.length === 0) return -1;

  const idIndex = sources.findIndex((source) => sourceReferenceKeys(source).some((key) => sameReferenceKey(key, reference)));
  if (idIndex >= 0) return idIndex;

  const ordinal = Number(reference);
  if (!preferId && Number.isInteger(ordinal) && ordinal >= 1 && ordinal <= sources.length) {
    return ordinal - 1;
  }

  return -1;
}

function answerToHtml(answer, sources = []) {
  let html = markdownToHtml(answer);
  if (!Array.isArray(sources) || sources.length === 0) return html;

  html = html.replace(/\bID:\s*(\d{8,})/g, (match, rawId) => {
    const sourceIndex = findSourceReferenceIndex(rawId, sources, { preferId: true });
    if (sourceIndex < 0) return match;

    const displayIndex = sourceIndex + 1;
    return `ID: <button class="answer-ref answer-id" type="button" data-ref-index="${displayIndex}" aria-label="Show reference ${displayIndex}">${rawId}</button>`;
  });

  return html.replace(/\[ref:([^\]\s]+)\]|\[(\d+)\]/g, (match, rawRefId, rawIndex) => {
    const isExplicitRef = Boolean(rawRefId);
    const rawReference = rawRefId || rawIndex;
    const sourceIndex = findSourceReferenceIndex(rawReference, sources, { preferId: isExplicitRef });
    if (sourceIndex < 0) return match;

    const displayIndex = sourceIndex + 1;
    return `<button class="answer-ref" type="button" data-ref-index="${displayIndex}" aria-label="Show reference ${displayIndex}">[${displayIndex}]</button>`;
  });
}

function ensureReferencePreview() {
  if (referencePreviewEl) return referencePreviewEl;
  referencePreviewEl = document.createElement("aside");
  referencePreviewEl.className = "reference-preview hidden";
  referencePreviewEl.hidden = true;
  referencePreviewEl.setAttribute("aria-hidden", "true");
  document.body.appendChild(referencePreviewEl);
  referencePreviewEl.addEventListener("mouseenter", () => {
    if (referencePreviewHideTimer) {
      window.clearTimeout(referencePreviewHideTimer);
      referencePreviewHideTimer = null;
    }
  });
  referencePreviewEl.addEventListener("mouseleave", hideReferencePreview);
  return referencePreviewEl;
}

function renderReferencePreview(item, index) {
  const preview = ensureReferencePreview();
  const imageUrl = productImageUrl(item);
  const body = String(item?.description || item?.text || item?.content || "").trim();
  const title = String(item?.title || "").trim() || body.split(/(?<=[.!?])\s+/)[0] || `Reference ${index}`;
  const description = body.length > 150 ? `${body.slice(0, 150)}...` : body;

  preview.innerHTML = "";

  const media = document.createElement("div");
  media.className = "reference-preview-media";
  if (imageUrl) {
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = title;
    media.appendChild(image);
  } else {
    media.textContent = "No image";
  }

  const copy = document.createElement("div");
  copy.className = "reference-preview-copy";

  const eyebrow = document.createElement("p");
  eyebrow.className = "reference-preview-eyebrow";
  eyebrow.textContent = `Reference ${index}${item?.category ? ` · ${item.category}` : ""}`;

  const heading = document.createElement("h3");
  heading.textContent = title.slice(0, 120);

  const price = document.createElement("p");
  price.className = "reference-preview-price";
  price.textContent = `${productPrice(item)} · ${productRating(item)}`;

  const text = document.createElement("p");
  text.className = "reference-preview-text";
  text.textContent = description || "No product description available.";

  copy.append(eyebrow, heading, price, text);
  preview.append(media, copy);
  return preview;
}

function positionReferencePreview(preview, target) {
  const rect = target.getBoundingClientRect();
  preview.classList.remove("hidden");
  preview.hidden = false;
  preview.style.left = "0px";
  preview.style.top = "0px";

  const previewRect = preview.getBoundingClientRect();
  const gap = 10;
  const margin = 12;
  let left = rect.left + rect.width / 2 - previewRect.width / 2;
  left = Math.max(margin, Math.min(left, window.innerWidth - previewRect.width - margin));
  let top = rect.bottom + gap;
  if (top + previewRect.height + margin > window.innerHeight) {
    top = rect.top - previewRect.height - gap;
  }
  top = Math.max(margin, top);
  preview.style.left = `${left}px`;
  preview.style.top = `${top}px`;
}

function showReferencePreview(target, index) {
  const item = currentVisibleSources[index - 1];
  if (!target || !item) return;
  if (referencePreviewHideTimer) {
    window.clearTimeout(referencePreviewHideTimer);
    referencePreviewHideTimer = null;
  }
  const preview = renderReferencePreview(item, index);
  positionReferencePreview(preview, target);
  preview.setAttribute("aria-hidden", "false");
}

function hideReferencePreview({ delay = 120 } = {}) {
  if (!referencePreviewEl) return;
  if (referencePreviewHideTimer) {
    window.clearTimeout(referencePreviewHideTimer);
  }
  referencePreviewHideTimer = window.setTimeout(() => {
    referencePreviewEl.classList.add("hidden");
    referencePreviewEl.hidden = true;
    referencePreviewEl.setAttribute("aria-hidden", "true");
  }, delay);
}

function focusSourceReference(index) {
  const card = gridEl.querySelector(`[data-source-index="${index}"]`);
  if (!card) return;
  card.classList.add("source-ref-flash");
  card.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(() => card.classList.remove("source-ref-flash"), 1400);
}

function openSourceReference(index) {
  const item = currentVisibleSources[index - 1];
  if (!item) return;
  hideReferencePreview({ delay: 0 });
  renderCommentModal(item);
  setProductModalOpen(true);
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
  resizeTextarea(followupInputEl, 160);
}

function submitOnEnter(event, callback) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    callback();
  }
}

homeFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  activeExampleQuestion = null;
  renderExampleCards();
  askAi({ resetConversation: true });
});
homeRandomQuestionBtn.addEventListener("click", chooseRandomQuestionForHome);
homeQueryEl.addEventListener("input", () => resizeTextarea(homeQueryEl, 180));
homeQueryEl.addEventListener("keydown", (event) => submitOnEnter(event, () => homeFormEl.requestSubmit()));
if (homeCustomPromptEl) {
  homeCustomPromptEl.addEventListener("input", () => {
    syncCustomPrompt(homeCustomPromptEl.value, homeCustomPromptEl);
    resizeTextarea(homeCustomPromptEl, 220);
  });
}
resultsTopFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  activeExampleQuestion = null;
  renderExampleCards();
  askAi({ message: resultsQueryEl.value, resetConversation: true });
});
resultsQueryEl.addEventListener("input", () => resizeTextarea(resultsQueryEl, 150));
resultsQueryEl.addEventListener("keydown", (event) => submitOnEnter(event, () => resultsTopFormEl.requestSubmit()));
resultsCustomPromptEl.addEventListener("input", () => {
  syncCustomPrompt(resultsCustomPromptEl.value, resultsCustomPromptEl);
  resizeTextarea(resultsCustomPromptEl, 220);
});
followupFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  submitFollowup(followupInputEl);
});
followupInputEl.addEventListener("input", resizeFollowup);
followupInputEl.addEventListener("keydown", (event) => submitOnEnter(event, () => submitFollowup(followupInputEl)));
aiHistoryEl.addEventListener("click", (event) => {
  const refButton = event.target.closest(".answer-ref");
  if (!refButton) return;
  openSourceReference(Number(refButton.dataset.refIndex || 0));
});
aiHistoryEl.addEventListener("mouseover", (event) => {
  const refButton = event.target.closest(".answer-ref");
  if (!refButton) return;
  showReferencePreview(refButton, Number(refButton.dataset.refIndex || 0));
});
aiHistoryEl.addEventListener("focusin", (event) => {
  const refButton = event.target.closest(".answer-ref");
  if (!refButton) return;
  showReferencePreview(refButton, Number(refButton.dataset.refIndex || 0));
});
aiHistoryEl.addEventListener("mouseout", (event) => {
  if (!event.target.closest(".answer-ref")) return;
  hideReferencePreview();
});
aiHistoryEl.addEventListener("focusout", (event) => {
  if (!event.target.closest(".answer-ref")) return;
  hideReferencePreview({ delay: 0 });
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
resizeQueryTextareas();
setProductModalOpen(false);
loadExampleBank();
