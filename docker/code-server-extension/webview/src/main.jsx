import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./styles.css";

const vscode = window.acquireVsCodeApi();

function formatDuration(ms) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function cleanAssistantText(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const markers = [
    "我会先",
    "我先",
    "现在",
    "下面是",
    "Here's",
    "I will",
    "I'll",
  ];
  const positions = markers
    .map((marker) => raw.indexOf(marker))
    .filter((index) => index >= 0);
  if (!positions.length) return raw;
  return raw.slice(Math.min(...positions)).trim();
}

function createMessage(role, content = "") {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    content,
    role,
  };
}

function ToolActivity({ activities, done, startedAt }) {
  const [open, setOpen] = useState(false);
  const duration = startedAt ? formatDuration(Date.now() - startedAt) : "1s";
  if (!activities.length) return null;

  const label = done
    ? `Worked for ${duration} · ${activities.length} activities`
    : `Working · ${activities.length} activities`;

  return (
    <section className="activity-card">
      <button className="activity-summary" onClick={() => setOpen((value) => !value)}>
        <span className="activity-pulse" />
        <span>{label}</span>
        <span className="activity-chevron">{open ? "⌄" : "›"}</span>
      </button>
      {open ? (
        <div className="activity-details">
          {activities.slice(-24).map((item, index) => (
            <div className="activity-row" key={`${item}-${index}`}>
              <span className="activity-dot" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function MarkdownMessage({ children }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ children: linkChildren, ...props }) => (
          <a {...props} rel="noreferrer" target="_blank">
            {linkChildren}
          </a>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function MessageBubble({ message }) {
  if (message.role === "assistant") {
    return (
      <article className="message assistant-message">
        <MarkdownMessage>{message.content}</MarkdownMessage>
      </article>
    );
  }

  return <article className="message user-message">{message.content}</article>;
}

function SendIcon() {
  return (
    <svg aria-hidden="true" className="composer-action-icon" viewBox="0 0 16 16">
      <path
        d="M8 2.5 13.5 8 8 13.5V9.5H3.5V6.5H8V2.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg aria-hidden="true" className="composer-action-icon" viewBox="0 0 16 16">
      <rect fill="currentColor" height="8" rx="1" width="8" x="4" y="4" />
    </svg>
  );
}

function Composer({ disabled, onStop, onSubmit }) {
  const [text, setText] = useState("");
  const [includeSelection, setIncludeSelection] = useState(true);
  const textareaRef = useRef(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
  }, [text]);

  const submit = () => {
    const prompt = text.trim();
    if (!prompt || disabled) return;
    onSubmit(prompt, includeSelection);
    setText("");
  };

  return (
    <section className="composer-shell">
      <div className="composer">
        <textarea
          ref={textareaRef}
          value={text}
          placeholder="Describe what to build"
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="composer-footer">
          <div className="composer-tools">
            <button className="icon-button" type="button">+</button>
            <button className="icon-button" type="button">@</button>
            <label className="selection-toggle">
              <input
                checked={includeSelection}
                type="checkbox"
                onChange={(event) => setIncludeSelection(event.target.checked)}
              />
              Selection
            </label>
          </div>
          <button
            aria-label={disabled ? "停止" : "发送"}
            className={`composer-action-button${disabled ? " is-stop" : " is-send"}`}
            disabled={!disabled && !text.trim()}
            onClick={disabled ? onStop : submit}
            type="button"
          >
            {disabled ? <StopIcon /> : <SendIcon />}
          </button>
        </div>
      </div>
    </section>
  );
}

function App() {
  const [messages, setMessages] = useState([]);
  const [activities, setActivities] = useState([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [modalText, setModalText] = useState("");
  const viewportRef = useRef(null);

  useEffect(() => {
    const handler = (event) => {
      const payload = event.data || {};
      if (payload.type === "assistant") {
        const text = cleanAssistantText(payload.text);
        if (!text) return;
        setMessages((current) => {
          const next = [...current];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: text };
          } else {
            next.push(createMessage("assistant", text));
          }
          return next;
        });
      } else if (payload.type === "activity") {
        setActivities((current) => [...current, String(payload.text || "Working")]);
      } else if (payload.type === "done") {
        setRunning(false);
        setDone(true);
        setMessages((current) => {
          const last = current[current.length - 1];
          if (last?.role === "assistant" && last.content) {
            setModalText(last.content);
          }
          return current;
        });
      } else if (payload.type === "error") {
        setRunning(false);
        const text = String(payload.text || "Task failed");
        if (text.includes("任务已停止") || text.includes("stopped")) {
          setMessages((current) => [...current, createMessage("assistant", `**已停止**`)]);
        } else {
          setMessages((current) => [...current, createMessage("assistant", `**Failed:** ${text}`)]);
        }
      } else if (payload.type === "status") {
        const text = String(payload.text || "Status updated");
        if (text.toLowerCase().includes("already running")) {
          setRunning(false);
          setDone(true);
          setMessages((current) => [
            ...current,
            createMessage("assistant", "**提示：** 上一轮 Agent 尚未释放，请稍候再试或刷新 IDE 面板。"),
          ]);
          return;
        }
        setActivities((current) => [...current, text]);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollTop = viewport.scrollHeight;
  }, [messages, activities]);

  const empty = useMemo(() => !messages.length && !activities.length, [activities.length, messages.length]);

  const submit = (prompt, includeSelection) => {
    setMessages((current) => [...current, createMessage("user", prompt)]);
    setActivities([]);
    setDone(false);
    setRunning(true);
    setStartedAt(Date.now());
    vscode.postMessage({ includeSelection, prompt, type: "run" });
  };

  const stop = () => {
    vscode.postMessage({ type: "stop" });
  };

  return (
    <main className="agent-shell">
      <section className="thread" ref={viewportRef}>
        {empty ? (
          <div className="empty-state">
            <div className="empty-mark">A</div>
            <strong>Build with Agent</strong>
            <p>Ask AppForge Agent to edit, explain, or run tasks in this workspace.</p>
          </div>
        ) : null}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <ToolActivity activities={activities} done={done} startedAt={startedAt} />
      </section>
      <Composer disabled={running} onStop={stop} onSubmit={submit} />
      {modalText && (
        <div className="result-modal-overlay" onClick={() => setModalText("")}>
          <div className="result-modal" onClick={(e) => e.stopPropagation()}>
            <div className="result-modal-header">
              <strong>Agent 执行结果</strong>
              <button className="result-modal-close" onClick={() => setModalText("")}>×</button>
            </div>
            <div className="result-modal-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{modalText}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
