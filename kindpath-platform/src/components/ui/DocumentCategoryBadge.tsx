import type { DocumentCategory } from '@/types/database';
import { CATEGORY_LABELS } from '@/features/documents/api';
import { Badge } from '@/components/ui/Badge';

export function DocumentCategoryBadge({ category }: { category: DocumentCategory }) {
  if (category === 'bsp_risk_plan') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-clay px-2.5 py-0.5 text-xs font-medium text-terracotta">
        ⚠ {CATEGORY_LABELS[category]}
      </span>
    );
  }
  return <Badge tone="slate">{CATEGORY_LABELS[category]}</Badge>;
}
