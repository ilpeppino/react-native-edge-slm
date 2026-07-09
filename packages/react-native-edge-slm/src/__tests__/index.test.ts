import { EdgeSLM, LocalAI, LocalAIFacade } from '../index';

describe('public entry point', () => {
  it('exposes the LocalAI singleton and its class', () => {
    expect(LocalAI).toBeInstanceOf(LocalAIFacade);
  });

  it('EdgeSLM is a brand alias for the same LocalAI singleton', () => {
    expect(EdgeSLM).toBe(LocalAI);
  });
});
