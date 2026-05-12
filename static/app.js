const homeScreenEl = document.getElementById("home-screen");
const resultsScreenEl = document.getElementById("results-screen");
const homeFormEl = document.getElementById("home-form");
const homeQueryEl = document.getElementById("home-query");
const homeSearchBtn = document.getElementById("home-search-btn");
const homeAiBtn = document.getElementById("home-ai-btn");
const resultsSearchFormEl = document.getElementById("results-search-form");
const resultsQueryEl = document.getElementById("results-query");
const resultsSearchBtn = document.getElementById("results-search-btn");
const errorBannerEl = document.getElementById("error-banner");
const gridEl = document.getElementById("grid");
const metaEl = document.getElementById("meta");
const aiOverviewEl = document.getElementById("ai-overview");
const aiAnswerEl = document.getElementById("ai-answer");
const aiHistoryEl = document.getElementById("ai-history");
const followupFormEl = document.getElementById("followup-form");
const followupInputEl = document.getElementById("followup-input");
const followupSendBtn = document.getElementById("followup-send-btn");
const pageMetaEl = document.getElementById("page-meta");
const pageButtonsEl = document.getElementById("page-buttons");
const prevPageBtn = document.getElementById("prev-page-btn");
const nextPageBtn = document.getElementById("next-page-btn");
const template = document.getElementById("card-template");
const productModalEl = document.getElementById("product-modal");
const productModalBackdropBtn = document.getElementById("product-modal-backdrop");
const productModalCloseBtn = document.getElementById("product-modal-close-btn");
const productModalTitleEl = document.getElementById("product-modal-title");
const productModalPriceEl = document.getElementById("product-modal-price");
const productModalBrandEl = document.getElementById("product-modal-brand");
const productModalRatingEl = document.getElementById("product-modal-rating");
const productModalDescriptionEl = document.getElementById("product-modal-description");

const PAGE_SIZE = 10;
let currentOffset = 0;
let currentTotal = 0;
let chatConversationUuid = null;
let currentSearchMode = "comments";
let aiConversation = [];
let currentQuery = "";

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

function setResultsVisible(isVisible) {
  homeScreenEl.classList.toggle("hidden", isVisible);
  homeScreenEl.hidden = isVisible;
  resultsScreenEl.classList.toggle("hidden", !isVisible);
  resultsScreenEl.hidden = !isVisible;
}

function setAiVisible(isVisible) {
  aiOverviewEl.classList.toggle("hidden", !isVisible);
  aiOverviewEl.hidden = !isVisible;
  followupFormEl.classList.toggle("hidden", !isVisible);
  followupFormEl.hidden = !isVisible;
}

function setResultsSearchVisible(isVisible) {
  resultsSearchFormEl.classList.toggle("hidden", !isVisible);
  resultsSearchFormEl.hidden = !isVisible;
}

function renderAiConversation({ loadingQuestion = "" } = {}) {
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
    answer.innerHTML = markdownToHtml(turn.answer || "No AI overview was returned.");
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
    answer.innerHTML = "<p>Generating an answer from FIQA sources...</p>";
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
}

function setAiOverview(text, { loading = false, question = "" } = {}) {
  aiOverviewEl.classList.toggle("loading", loading);
  if (loading) {
    renderAiConversation({ loadingQuestion: question });
    return;
  }

  const cleanText = String(text || "").trim();
  if (question) {
    aiConversation.push({
      question,
      answer: cleanText || "No AI overview was returned.",
    });
  }
  renderAiConversation();
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

function setSearchBusy(isBusy) {
  homeSearchBtn.disabled = isBusy;
  homeAiBtn.disabled = isBusy;
  resultsQueryEl.disabled = isBusy;
  resultsSearchBtn.disabled = isBusy;
  followupInputEl.disabled = isBusy;
  followupSendBtn.disabled = isBusy;
  homeSearchBtn.textContent = isBusy && currentSearchMode === "comments" ? "Searching..." : "Search";
  homeAiBtn.textContent = isBusy && currentSearchMode === "assistant" ? "Asking..." : "Ask AI";
  resultsSearchBtn.textContent = isBusy && currentSearchMode === "comments" ? "Searching..." : "Search";
}

function renderCommentModal(comment) {
  const body = String(comment.description || comment.text || "").trim();
  const headline = (comment.title || "").trim() || body.split(/(?<=[.!?])\s+/)[0] || "Comment";
  productModalTitleEl.textContent = headline.slice(0, 160);
  productModalPriceEl.textContent = comment.url ? `URL: ${comment.url}` : "URL: N/A";
  productModalBrandEl.textContent = `Source: ${comment.source || "Community"}`;
  productModalRatingEl.textContent = `Comment ID: ${comment.document_id || comment.id || "N/A"}`;
  productModalDescriptionEl.textContent = body || "No comment text available.";
}

function renderComments(items, total, offset, limit) {
  gridEl.innerHTML = "";
  currentTotal = total;

  metaEl.textContent = total ? `${total} source${total === 1 ? "" : "s"}` : "No sources found";
  renderPagination(total, offset, limit);

  if (!items.length) {
    return;
  }

  for (const comment of items) {
    const node = template.content.cloneNode(true);
    const preview = String(comment.description || comment.text || "").trim();
    const headline = (comment.title || "").trim() || preview.split(/(?<=[.!?])\s+/)[0] || "Untitled comment";
    const shortPreview = preview.length > 280 ? `${preview.slice(0, 280)}...` : preview;
    const commentId = comment.document_id || comment.id || "N/A";
    const source = (comment.source || "").trim() || "Community";

    node.querySelector(".title").textContent = headline.slice(0, 160);
    node.querySelector(".rating").textContent = source;
    node.querySelector(".bought").textContent = `Comment ID ${commentId}`;
    node.querySelector(".id").textContent = comment.knn_dist == null ? `ID: ${comment.id || "N/A"}` : `KNN distance: ${Number(comment.knn_dist).toFixed(4)}`;
    node.querySelector(".brand").textContent = `Source: ${source}`;
    node.querySelector(".color").textContent = `Comment: ${commentId}`;
    node.querySelector(".delivery").textContent = comment.url || "";
    node.querySelector(".product-locale").textContent = `Comment ID: ${commentId}`;
    node.querySelector(".example-id").textContent = `Row ID: ${comment.id || "N/A"}`;
    node.querySelector(".query-id").textContent = `Source: ${source}`;
    node.querySelector(".query").textContent = `URL: ${comment.url || "N/A"}`;
    node.querySelector(".esci-label").textContent = "Collection: FIQA";
    node.querySelector(".small-version").textContent = "";
    node.querySelector(".large-version").textContent = "";
    node.querySelector(".split").textContent = "";
    node.querySelector(".source").textContent = `Text length: ${(comment.description || "").length}`;
    node.querySelector(".description").textContent = shortPreview || "No text";

    const cardEl = node.querySelector(".card");
    cardEl.classList.add("clickable");
    cardEl.addEventListener("click", () => {
      renderCommentModal(comment);
      setProductModalOpen(true);
    });

    const detailsEl = node.querySelector(".dataset-details");
    detailsEl.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    gridEl.appendChild(node);
  }
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
      source: source.source || "Community",
      knn_dist: distance,
    };
  });
}

function buildPageTokens(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const tokens = [1];
  const left = Math.max(2, currentPage - 1);
  const right = Math.min(totalPages - 1, currentPage + 1);

  if (left > 2) tokens.push("...");
  for (let p = left; p <= right; p += 1) tokens.push(p);
  if (right < totalPages - 1) tokens.push("...");
  tokens.push(totalPages);

  return tokens;
}

function renderPagination(total, offset, limit) {
  pageButtonsEl.innerHTML = "";

  if (!total) {
    pageMetaEl.textContent = "Page 0 of 0";
    prevPageBtn.disabled = true;
    nextPageBtn.disabled = true;
    return;
  }

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  pageMetaEl.textContent = `Page ${currentPage} of ${totalPages}`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;

  const tokens = buildPageTokens(currentPage, totalPages);
  for (const token of tokens) {
    if (token === "...") {
      const dots = document.createElement("span");
      dots.className = "page-ellipsis";
      dots.textContent = "...";
      pageButtonsEl.appendChild(dots);
      continue;
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "page-btn";
    if (token === currentPage) btn.classList.add("active");
    btn.textContent = String(token);
    btn.addEventListener("click", () => {
      currentOffset = (token - 1) * limit;
      scrollToResultsTop();
      loadComments();
    });
    pageButtonsEl.appendChild(btn);
  }
}

function scrollToResultsTop() {
  const top = Math.max(0, gridEl.getBoundingClientRect().top + window.scrollY - 110);
  window.scrollTo({ top, behavior: "smooth" });
}

async function loadComments({ resetOffset = false, preserveAi = false } = {}) {
  if (!preserveAi) currentSearchMode = "comments";
  if (resetOffset) currentOffset = 0;
  clearError();
  currentQuery = (preserveAi ? currentQuery : resultsQueryEl.value || homeQueryEl.value).trim();
  homeQueryEl.value = currentQuery;
  resultsQueryEl.value = currentQuery;
  setResultsVisible(true);
  if (!preserveAi) {
    setAiVisible(false);
    setResultsSearchVisible(true);
    clearAiConversation();
  }
  setSearchBusy(true);

  const params = new URLSearchParams({
    q: currentQuery,
    sort: "relevance",
    limit: String(PAGE_SIZE),
    offset: String(currentOffset),
  });

  try {
    const response = await fetch(`/api/comments?${params.toString()}`);
    if (!response.ok) {
      const message = await readErrorMessage(response, "Failed to load comments");
      showError(message);
      metaEl.textContent = "Failed to load comments";
      return null;
    }

    const payload = await response.json();
    currentOffset = payload.offset || 0;
    renderComments(payload.items || [], payload.total || 0, payload.offset || 0, payload.limit || PAGE_SIZE);
    return payload;
  } catch (error) {
    console.error("Failed to load comments:", error);
    showError(`Network error while loading comments: ${error.message || error}`);
    metaEl.textContent = "Network error while loading comments";
    gridEl.innerHTML = "";
    pageMetaEl.textContent = "";
    pageButtonsEl.innerHTML = "";
    prevPageBtn.disabled = true;
    nextPageBtn.disabled = true;
    return null;
  } finally {
    setSearchBusy(false);
  }
}

async function runSearch({ resetOffset = true, message = "" } = {}) {
  const text = (message || homeQueryEl.value).trim();
  if (!text) {
    clearAiConversation();
    return loadComments({ resetOffset });
  }

  homeQueryEl.value = text;
  currentQuery = text;
  currentSearchMode = "assistant";
  if (resetOffset) currentOffset = 0;
  clearError();
  setResultsVisible(true);
  setResultsSearchVisible(false);
  setAiVisible(true);
  setAiOverview("", { loading: true, question: text });
  setSearchBusy(true);

  try {
    const response = await fetch("/api/assistant/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        conversation_uuid: chatConversationUuid,
      }),
    });

    if (!response.ok) {
      const message = await readErrorMessage(response, "AI search failed");
      showError(message);
      setAiOverview("AI overview is unavailable for this search. Showing matching sources instead.", { question: text });
      return loadComments({ resetOffset: true, preserveAi: true });
    }

    const payload = await response.json();
    chatConversationUuid = payload.conversation_uuid || chatConversationUuid;
    setAiOverview((payload.response || "").trim() || "No AI overview was returned.", { question: text });

    const chatItems = Array.isArray(payload.items) ? payload.items : [];
    const chatSources = normalizeChatSources(payload.sources);
    const sources = chatItems.length ? chatItems : chatSources;

    if (sources.length) {
      renderComments(sources, sources.length, 0, Math.max(PAGE_SIZE, sources.length));
      return payload;
    }

    const searchQuery = (payload.search_query || "").trim();
    if (searchQuery) {
      homeQueryEl.value = searchQuery;
      currentQuery = searchQuery;
    }
    return loadComments({ resetOffset: true, preserveAi: true });
  } catch (error) {
    console.error("AI search failed:", error);
    const message = `AI search backend is not available right now: ${error.message || error}`;
    showError(message);
    setAiOverview("AI overview is unavailable for this search. Showing matching sources instead.", { question: text });
    return loadComments({ resetOffset: true, preserveAi: true });
  } finally {
    aiOverviewEl.classList.remove("loading");
    setSearchBusy(false);
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

async function submitFollowup() {
  const text = followupInputEl.value.trim();
  if (!text) return;
  followupInputEl.value = "";
  await runSearch({ resetOffset: true, message: text });
  followupInputEl.focus();
}

homeFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  currentQuery = homeQueryEl.value.trim();
  resultsQueryEl.value = currentQuery;
  loadComments({ resetOffset: true });
});
homeAiBtn.addEventListener("click", () => {
  runSearch({ resetOffset: true });
});
resultsSearchFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  currentQuery = resultsQueryEl.value.trim();
  homeQueryEl.value = currentQuery;
  loadComments({ resetOffset: true });
});
followupFormEl.addEventListener("submit", (event) => {
  event.preventDefault();
  submitFollowup();
});
prevPageBtn.addEventListener("click", () => {
  if (currentOffset <= 0) return;
  currentOffset = Math.max(0, currentOffset - PAGE_SIZE);
  scrollToResultsTop();
  loadComments();
});
nextPageBtn.addEventListener("click", () => {
  if (currentOffset + PAGE_SIZE >= currentTotal) return;
  currentOffset += PAGE_SIZE;
  scrollToResultsTop();
  loadComments();
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
setResultsSearchVisible(false);
clearAiConversation();
setProductModalOpen(false);
