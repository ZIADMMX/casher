import { useState, useRef, useEffect } from 'react';
import * as aiApi from '../api/ai.js';
import '../styles/agentChat.css';

const TOOL_LABELS = {
  getSalesSummary: 'ملخص المبيعات',
  getTopProducts: 'أعلى الأصناف',
  getLowStock: 'نواقص المخزون',
  searchProducts: 'بحث الأصناف',
  getCustomerBalance: 'مديونية العميل',
  getSuppliers: 'الموردين',
  getCurrentShift: 'الوردية الحالية',
};

export default function AgentChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState([]); // what the user sees: { role: 'user'|'assistant'|'error', text, steps? }
  const [history, setHistory] = useState([]); // what the agent needs: raw conversation
  const [proposal, setProposal] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [view, proposal, busy]);

  const push = (message) => setView((v) => [...v, message]);

  async function send(event) {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || busy) return;
    setInput('');
    setProposal(null);
    push({ role: 'user', text: prompt });
    setBusy(true);
    try {
      const out = await aiApi.askAIAgent({ prompt, history });
      setHistory(out.history);
      push({ role: 'assistant', text: out.reply, steps: out.steps });
      setProposal(out.proposal || null);
    } catch (e) {
      push({ role: 'error', text: e.message || 'حدث خطأ' });
    } finally {
      setBusy(false);
    }
  }

  async function resolveProposal(confirm) {
    const id = proposal.id;
    setProposal(null);
    setBusy(true);
    try {
      if (confirm) {
        const { result } = await aiApi.confirmAIAgentProposal(id);
        push({ role: 'assistant', text: result?.invoiceNumber ? `تم إنشاء المسودة رقم ${result.invoiceNumber}.` : 'تم التنفيذ.' });
      } else {
        await aiApi.discardAIAgentProposal(id);
        push({ role: 'assistant', text: 'تم إلغاء المقترح.' });
      }
    } catch (e) {
      push({ role: 'error', text: e.message || 'حدث خطأ' });
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className="agent-fab" onClick={() => setOpen(true)} aria-label="فتح المساعد الذكي">
        مساعد
      </button>
    );
  }

  return (
    <section className="agent-panel" aria-label="المساعد الذكي">
      <header className="agent-head">
        <strong>المساعد الذكي</strong>
        <button type="button" onClick={() => setOpen(false)} aria-label="إغلاق المساعد">×</button>
      </header>

      <div className="agent-body" aria-live="polite">
        {!view.length && <p className="agent-hint">اسأل عن المبيعات، المخزون، العملاء، الموردين أو الوردية.</p>}
        {view.map((m, i) => (
          <div key={i} className={`agent-msg agent-${m.role}`}>
            {m.text}
            {m.steps?.length > 0 && (
              <div className="agent-steps">{m.steps.map((s) => TOOL_LABELS[s.tool] || s.tool).join(' · ')}</div>
            )}
          </div>
        ))}
        {proposal && (
          <div className="agent-proposal">
            <div>{proposal.summary}</div>
            <div className="agent-proposal-actions">
              <button type="button" disabled={busy} onClick={() => resolveProposal(true)}>تأكيد</button>
              <button type="button" disabled={busy} onClick={() => resolveProposal(false)}>إلغاء</button>
            </div>
          </div>
        )}
        {busy && <div className="agent-msg agent-assistant">جاري التفكير…</div>}
        <div ref={endRef} />
      </div>

      <form className="agent-form" onSubmit={send}>
        <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={2000} placeholder="اكتب سؤالك" aria-label="سؤالك" />
        <button type="submit" disabled={busy || !input.trim()}>إرسال</button>
      </form>
    </section>
  );
}
