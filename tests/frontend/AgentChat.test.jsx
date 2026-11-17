import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import AgentChat from '../../src/components/AgentChat.jsx';

function setup(api) {
  window.electronAPI = api;
  render(<AgentChat />);
  fireEvent.click(screen.getByLabelText('فتح المساعد الذكي'));
}

function ask(text) {
  fireEvent.change(screen.getByLabelText('سؤالك'), { target: { value: text } });
  fireEvent.click(screen.getByText('إرسال'));
}

describe('AgentChat', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    cleanup();
    delete window.electronAPI;
  });

  it('sends the question with the running history and shows the reply and the tools used', async () => {
    const askAIAgent = vi.fn(async () => ({ reply: 'المبيعات 500', history: [{ role: 'user', content: 'x' }], steps: [{ tool: 'getSalesSummary', ok: true }] }));
    setup({ askAIAgent });
    ask('مبيعات النهارده؟');

    expect(await screen.findByText(/المبيعات 500/)).toBeTruthy();
    expect(screen.getByText('ملخص المبيعات')).toBeTruthy();
    expect(askAIAgent).toHaveBeenCalledWith({ prompt: 'مبيعات النهارده؟', history: [] });

    ask('والشهر؟');
    await waitFor(() => expect(askAIAgent).toHaveBeenCalledTimes(2));
    expect(askAIAgent.mock.calls[1][0].history).toEqual([{ role: 'user', content: 'x' }]);
  });

  it('shows a write proposal and runs it only after the user confirms', async () => {
    const api = {
      askAIAgent: vi.fn(async () => ({ reply: 'جهّزت مسودة', history: [], steps: [], proposal: { id: 'p1', summary: 'مسودة شراء: 2 صنف' } })),
      confirmAIAgentProposal: vi.fn(async () => ({ ok: true, result: { invoiceNumber: 'PO-AI-1' } })),
      discardAIAgentProposal: vi.fn(),
    };
    setup(api);
    ask('اطلب');

    await screen.findByText('مسودة شراء: 2 صنف');
    expect(api.confirmAIAgentProposal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('تأكيد'));

    expect(await screen.findByText(/PO-AI-1/)).toBeTruthy();
    expect(api.confirmAIAgentProposal).toHaveBeenCalledWith('p1');
    expect(api.discardAIAgentProposal).not.toHaveBeenCalled();
  });

  it('shows the plain error message when the agent call fails', async () => {
    setup({ askAIAgent: vi.fn(async () => { throw new Error('خدمة المساعد غير شغالة'); }) });
    ask('أي سؤال');
    expect(await screen.findByText('خدمة المساعد غير شغالة')).toBeTruthy();
  });
});
