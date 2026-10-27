import { tv, type VariantProps } from 'tailwind-variants';

export const button = tv({
	base: 'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-colors select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
	variants: {
		variant: {
			primary: 'bg-accent text-accent-fg hover:bg-accent/90',
			secondary: 'border border-line bg-surface text-fg hover:bg-surface-2',
			ghost: 'text-fg-2 hover:bg-surface-2 hover:text-fg',
			danger: 'bg-critical text-white hover:bg-critical/90'
		},
		size: {
			sm: 'h-7 px-2.5 text-xs',
			md: 'h-8 px-3 text-sm',
			lg: 'h-10 px-4 text-sm',
			icon: 'size-8',
			'icon-sm': 'size-7'
		},
		active: { true: 'bg-surface-3 text-fg' }
	},
	defaultVariants: { variant: 'secondary', size: 'md' }
});
export type ButtonVariants = VariantProps<typeof button>;

export const input = tv({
	base: 'w-full min-w-0 rounded-md border border-line bg-surface px-2.5 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60 aria-invalid:border-critical aria-invalid:ring-critical/25',
	variants: {
		size: { sm: 'h-7 text-xs', md: 'h-8' },
		mono: { true: 'font-mono text-[13px]' }
	},
	defaultVariants: { size: 'md' }
});

export const badge = tv({
	base: 'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-none font-medium whitespace-nowrap',
	variants: {
		tone: {
			neutral: 'bg-surface-3 text-fg-2',
			blue: 'bg-blue/15 text-blue',
			good: 'bg-good/15 text-good',
			warning: 'bg-warning/20 text-fg',
			serious: 'bg-serious/20 text-fg',
			critical: 'bg-critical/15 text-critical',
			muted: 'bg-surface-2 text-muted',
			violet: 'bg-violet/15 text-violet'
		}
	},
	defaultVariants: { tone: 'neutral' }
});
export type BadgeTone = NonNullable<VariantProps<typeof badge>['tone']>;

export const card = tv({
	base: 'rounded-lg border border-line bg-surface'
});

export const label = tv({
	base: 'flex flex-col gap-1 text-xs font-medium text-fg-2'
});
