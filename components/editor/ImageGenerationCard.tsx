'use client'

import { cx } from '@/components/ui/primitives'

export interface ImageGenerationCardItem {
  imageUrl?: string
  alt?: string
  status: 'pending' | 'completed' | 'failed'
}

export interface ImageGenerationCardProps {
  count: number
  items: ImageGenerationCardItem[]
}

export function ImageGenerationCard({
  count,
  items,
}: ImageGenerationCardProps) {
  const visibleItems = items.slice(0, Math.max(1, Math.min(count, 5)))
  const selectedItem = visibleItems.find((item) => item.status === 'completed' && item.imageUrl) || visibleItems[0]

  return (
    <div className="w-full max-w-[92%] rounded-[1.6rem] bg-[#2a2a2a] p-3 text-white shadow-[0_10px_30px_rgb(0_0_0/0.16)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold tracking-tight text-white/92">Creating image</div>
        {count > 1 ? (
          <div className="rounded-full bg-white/8 px-3 py-1 text-xs text-white/80">
            {count} images
          </div>
        ) : null}
      </div>

      <div className="flex gap-3">
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-[1.45rem] bg-[#353535]">
          <div className="aspect-[16/9] w-full">
            {selectedItem?.status === 'completed' && selectedItem.imageUrl ? (
              <img
                src={selectedItem.imageUrl}
                alt={selectedItem.alt || 'Generated image'}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="relative h-full w-full overflow-hidden bg-[#353535]">
                <div className="absolute inset-0 opacity-60" style={{
                  backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.18) 1px, transparent 0)',
                  backgroundSize: '22px 22px',
                }} />
              </div>
            )}
          </div>
        </div>

        {visibleItems.length > 1 ? (
          <div className="flex w-[4.6rem] shrink-0 flex-col gap-2.5 overflow-y-auto pr-0.5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {visibleItems.map((item, index) => {
              const isSelected = item === selectedItem
              return (
                <div
                  key={`${index}-${item.status}`}
                  className={cx(
                    'overflow-hidden rounded-[1rem] border bg-[#353535]',
                    isSelected ? 'border-white/55' : 'border-white/8',
                  )}
                >
                  <div className="aspect-square w-full">
                    {item.status === 'completed' && item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.alt || `Generated image ${index + 1}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full bg-[#353535]" />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </div>
    </div>
  )
}
