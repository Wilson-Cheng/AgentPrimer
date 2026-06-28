import { describe, expect, it } from 'vitest';
import { normalizeChatCompletionChunk, shouldExecuteToolCalls, createThinkExtractor } from '../lib/agent';

describe('normalizeChatCompletionChunk', () => {
  it('normalizes OpenAI-compatible text and tool call deltas', () => {
    const normalized = normalizeChatCompletionChunk({
      choices: [{
        finish_reason: 'tool_calls',
        delta: {
          content: 'hello',
          tool_calls: [{
            index: 0,
            id: 'call_1',
            function: { name: 'search_web', arguments: '{"query":"agent"}' },
          }],
        },
      }],
    });

    expect(normalized).toEqual({
      finishReason: 'tool_calls',
      textDelta: 'hello',
      reasoningDelta: '',
      toolCallDeltas: [{ index: 0, id: 'call_1', name: 'search_web', argumentsDelta: '{"query":"agent"}' }],
    });
  });

  it('normalizes common reasoning/thinking fields', () => {
    expect(normalizeChatCompletionChunk({ choices: [{ delta: { reasoning_content: 'deepseek' } }] }).reasoningDelta).toBe('deepseek');
    expect(normalizeChatCompletionChunk({ choices: [{ delta: { thinking: 'claude-compatible' } }] }).reasoningDelta).toBe('claude-compatible');
    expect(normalizeChatCompletionChunk({ choices: [{ delta: { reasoning: 'glm-compatible' } }] }).reasoningDelta).toBe('glm-compatible');
  });

  it('normalizes camelCase tool call deltas', () => {
    const normalized = normalizeChatCompletionChunk({
      choices: [{
        finishReason: 'tool_calls',
        delta: {
          toolCalls: [{
            index: 1,
            toolCallId: 'call_2',
            function: { name: 'read_file', arguments_delta: '{"file_path":"x"}' },
          }],
        },
      }],
    });

    expect(normalized.finishReason).toBe('tool_calls');
    expect(normalized.toolCallDeltas).toEqual([
      { index: 1, id: 'call_2', name: 'read_file', argumentsDelta: '{"file_path":"x"}' },
    ]);
  });

  it('normalizes legacy function_call streaming', () => {
    const normalized = normalizeChatCompletionChunk({
      choices: [{
        finish_reason: 'function_call',
        delta: {
          function_call: { name: 'search_files', arguments: '{"pattern":"*.ts"}' },
        },
      }],
    });

    expect(normalized.finishReason).toBe('tool_calls');
    expect(normalized.toolCallDeltas).toEqual([
      { index: 0, name: 'search_files', argumentsDelta: '{"pattern":"*.ts"}' },
    ]);
  });

  it('normalizes finish reason aliases', () => {
    expect(normalizeChatCompletionChunk({ choices: [{ finish_reason: 'max_tokens', delta: {} }] }).finishReason).toBe('length');
    expect(normalizeChatCompletionChunk({ choices: [{ finishReason: 'end_turn', delta: {} }] }).finishReason).toBe('stop');
  });

  it('executes complete tool calls even when a compatible provider finishes with stop', () => {
    expect(shouldExecuteToolCalls('stop', [{ name: 'read_file', args: '{"file_path":"x"}' }], '')).toBe(true);
    expect(shouldExecuteToolCalls('stop', [{ name: 'read_file', args: '{"file_path":"x"' }], '')).toBe(false);
    expect(shouldExecuteToolCalls('stop', [{ name: 'read_file', args: '{"file_path":"x"}' }], 'answer')).toBe(false);
  });
});

describe('createThinkExtractor', () => {
  function consume(deltas: string[]) {
    const ex = createThinkExtractor();
    let text = '';
    let reasoning = '';
    for (const delta of deltas) {
      const out = ex.push(delta);
      text += out.text;
      reasoning += out.reasoning;
    }
    const tail = ex.flush();
    return { text: text + tail.text, reasoning: reasoning + tail.reasoning };
  }

  it('routes <think> blocks emitted in a single chunk to reasoning', () => {
    expect(consume(['<think>analyzing</think>final answer'])).toEqual({
      text: 'final answer',
      reasoning: 'analyzing',
    });
  });

  it('handles tags split across chunks', () => {
    expect(consume(['hi <thi', 'nk>plan', 'ning</thi', 'nk> done'])).toEqual({
      text: 'hi  done',
      reasoning: 'planning',
    });
  });

  it('passes through plain content unchanged', () => {
    expect(consume(['hello ', 'world'])).toEqual({ text: 'hello world', reasoning: '' });
  });

  it('treats unterminated think blocks as reasoning when stream ends', () => {
    expect(consume(['<think>still thinking'])).toEqual({ text: '', reasoning: 'still thinking' });
  });

  it('tolerates attributes and case differences', () => {
    expect(consume(['<Think type="hidden">deep</Think>answer'])).toEqual({
      text: 'answer',
      reasoning: 'deep',
    });
  });
});
