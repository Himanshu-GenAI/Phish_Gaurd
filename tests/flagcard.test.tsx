import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import FlagCard from '../components/FlagCard';

describe('FlagCard UI Honesty Rendering', () => {
  it('renders rule-engine evidence in quotation marks without AI rationale label', () => {
    const html = renderToStaticMarkup(
      <FlagCard
        flag={{
          id: 'test-rule',
          label: 'Test Urgency',
          category: 'rules',
          weight: 20,
          evidence: 'turant pay karo',
        }}
        index={0}
      />
    );
    expect(html).toContain('“turant pay karo”');
    expect(html).not.toContain('AI rationale');
  });

  it('renders AI rationale text without quotation marks under an AI rationale label', () => {
    const html = renderToStaticMarkup(
      <FlagCard
        flag={{
          id: 'test-ai',
          label: 'Suspicious Toll-Free Number',
          category: 'ai',
          weight: 15,
          evidence: 'Caller states an urgent verification is needed',
        }}
        index={0}
      />
    );
    expect(html).toContain('AI rationale:');
    expect(html).toContain('Caller states an urgent verification is needed');
    expect(html).not.toContain('“Caller states an urgent verification is needed”');
  });
});
