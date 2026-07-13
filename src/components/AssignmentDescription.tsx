'use client';

import React from 'react';

interface AssignmentDescriptionProps {
  description: string | null;
}

export function AssignmentDescription({ description }: AssignmentDescriptionProps) {
  if (!description) {
    return <p className="text-xs text-text-secondary italic">No instructions provided.</p>;
  }

  return (
    <div className="space-y-2.5 text-xs text-text-secondary leading-relaxed">
      {description.split('\n\n').map((paragraph, idx) => {
        if (paragraph.startsWith('### ')) {
          return <h4 key={idx} className="font-bold text-text-primary uppercase tracking-wider text-[10px] pt-2">{paragraph.replace('### ', '')}</h4>;
        }
        if (paragraph.startsWith('- ')) {
          return (
            <ul key={idx} className="list-disc pl-4 space-y-1 font-medium">
              {paragraph.split('\n').map((li, lIdx) => (
                <li key={lIdx}>{li.replace('- ', '')}</li>
              ))}
            </ul>
          );
        }
        return <p key={idx} className="font-medium">{paragraph}</p>;
      })}
    </div>
  );
}
