import { writeFileSync } from 'fs';

const content = `'use client';
import {
  Children,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode
} from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, ArrowRight01Icon, Tick02Icon } from '@hugeicons/core-free-icons';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface StepProps {
  children?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
}

interface StepIndicatorProps {
  step: number;
  currentStep: number;
  onStepClick: (step: number) => void;
}

interface StepperProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'className' | 'style'> {
  children?: ReactNode;
  step?: number;
  initialStep?: number;
  onStepChange?: (step: number) => void;
  onFinalStepCompleted?: () => void;
  indicator?: 'numbers' | 'dots' | 'bars';
  orientation?: 'horizontal' | 'vertical';
  transition?: 'slide' | 'fade' | 'none';
  linear?: boolean;
  disableStepIndicators?: boolean;
  renderStepIndicator?: (props: StepIndicatorProps) => ReactNode;
  showFooter?: boolean;
  backButtonText?: string;
  nextButtonText?: string;
  completeButtonText?: string;
  backButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  nextButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  completedContent?: ReactNode;
  theme?: 'dark' | 'light';
  accentColor?: string;
  frame?: boolean;
  radius?: number;
  width?: number | string;
  className?: string;
  stepCircleContainerClassName?: string;
  stepContainerClassName?: string;
  contentClassName?: string;
  footerClassName?: string;
  style?: CSSProperties;
  validateStep?: (step: number) => boolean;
}

interface View {
  step: number;
  previous: number | null;
  direction: number;
  id: number;
}

const THEMES: Record<string, Record<string, string>> = {
  dark: {
    '--stepper-frame': '#051647',
    '--stepper-frame-edge': 'rgba(196, 214, 0, 0.18)',
    '--stepper-frame-highlight': 'rgba(196, 214, 0, 0.10)',
    '--stepper-frame-shadow': '0 22px 44px -20px rgba(0, 0, 0, 0.8), 0 6px 16px -8px rgba(0, 0, 0, 0.5)',
    '--stepper-tile': 'linear-gradient(180deg, #0a2360 0%, #051647 100%)',
    '--stepper-tile-edge': 'rgba(196, 214, 0, 0.12)',
    '--stepper-tile-highlight': 'rgba(196, 214, 0, 0.15)',
    '--stepper-tile-shadow': '0 4px 10px -4px rgba(0, 0, 0, 0.7)',
    '--stepper-well': 'rgba(196, 214, 0, 0.08)',
    '--stepper-track': 'rgba(196, 214, 0, 0.15)',
    '--stepper-ink': '#C4D600',
    '--stepper-muted': 'rgba(196, 214, 0, 0.55)',
    '--stepper-faint': 'rgba(196, 214, 0, 0.22)',
    '--stepper-ring': 'rgba(196, 214, 0, 0.3)',
    '--stepper-solid': '#C4D600',
    '--stepper-solid-ink': '#051647',
    '--stepper-hover': 'brightness(1.12)',
    '--stepper-hover-fill': 'rgba(196, 214, 0, 0.06)',
    '--stepper-solid-hover': 'brightness(0.9)',
    '--stepper-press': 'brightness(0.85)'
  },
  light: {
    '--stepper-frame': 'rgba(5, 22, 71, 0.06)',
    '--stepper-frame-edge': 'rgba(0, 33, 135, 0.1)',
    '--stepper-frame-highlight': 'rgba(255, 255, 255, 0.95)',
    '--stepper-frame-shadow': '0 22px 44px -22px rgba(5, 22, 71, 0.15), 0 6px 16px -10px rgba(5, 22, 71, 0.1)',
    '--stepper-tile': 'linear-gradient(180deg, #ffffff 0%, #f0f4ff 100%)',
    '--stepper-tile-edge': 'rgba(0, 33, 135, 0.1)',
    '--stepper-tile-highlight': 'rgba(255, 255, 255, 1)',
    '--stepper-tile-shadow': '0 4px 10px -5px rgba(5, 22, 71, 0.12)',
    '--stepper-well': 'rgba(0, 33, 135, 0.05)',
    '--stepper-track': 'rgba(0, 33, 135, 0.1)',
    '--stepper-ink': '#051647',
    '--stepper-muted': 'rgba(5, 22, 71, 0.55)',
    '--stepper-faint': 'rgba(0, 33, 135, 0.12)',
    '--stepper-ring': 'rgba(0, 33, 135, 0.2)',
    '--stepper-solid': '#002187',
    '--stepper-solid-ink': '#ffffff',
    '--stepper-hover': 'brightness(0.97)',
    '--stepper-hover-fill': 'rgba(0, 33, 135, 0.04)',
    '--stepper-solid-hover': 'brightness(1.3)',
    '--stepper-press': 'brightness(0.92)'
  }
};

const SPRING = 'linear(0, 0.0603, 0.2033, 0.3821, 0.5633, 0.7258, 0.8584, 0.9574, 1.0242, 1.0634, 1.0809, 1.0828, 1.0747, 1.0613, 1.046, 1.0313, 1.0186, 1.0085, 1.0012, 0.9965, 0.994, 0.9931, 0.9933, 0.9941, 0.9953, 0.9966, 0.9978, 0.9988, 1)';
const SETTLE = 'cubic-bezier(0.22, 1, 0.36, 1)';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const size = (value: number | string) => (typeof value === 'number' ? \`\${value}px\` : value);

const readableOn = (color: string) => {
  let hex = String(color || '').trim().replace('#', '');
  if (hex.length === 3) hex = hex.replace(/./g, c => c + c);
  if (!/^[0-9a-f]{6}$/i.test(hex)) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map(index => {
    const c = parseInt(hex.slice(index, index + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#18181b' : '#ffffff';
};

const ease = () =>
  typeof CSS !== 'undefined' && CSS.supports?.('transition-timing-function', 'linear(0, 1)')
    ? SPRING
    : 'cubic-bezier(0.34, 1.4, 0.64, 1)';

const INK = 'text-[color:var(--stepper-ink)]';
const MUTED = 'text-[color:var(--stepper-muted)]';
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--stepper-ink)]';

const ROOT_CLASS = 'relative box-border flex w-full max-w-full min-w-0 rounded-[var(--stepper-radius)] text-[color:var(--stepper-ink)] [-webkit-tap-highlight-color:transparent] [--stepper-tile-radius:max(4px,calc(var(--stepper-well-radius)-4px))] [--stepper-well-radius:max(6px,calc(var(--stepper-radius)-8px))]';
const FRAMED_CLASS = '[--stepper-bleed:20px] [--stepper-inset:12px] [--stepper-pad:8px] p-[var(--stepper-pad)] [background:var(--stepper-frame)] [box-shadow:var(--stepper-frame-shadow)] backdrop-blur-[20px] backdrop-saturate-[1.6]';
const BARE_CLASS = '[--stepper-bleed:8px] [--stepper-inset:0px] [--stepper-pad:0px]';
const RIM_CLASS = 'pointer-events-none absolute inset-0 z-[2] rounded-[inherit] [box-shadow:inset_0_0_0_1px_var(--stepper-frame-edge),inset_0_1px_0_var(--stepper-frame-highlight)]';
const TRACK_CLASS = 'relative flex gap-1 rounded-[var(--stepper-well-radius)] p-1 [background:var(--stepper-well)]';
const GLIDER_CLASS = 'pointer-events-none absolute top-0 left-0 rounded-[var(--stepper-tile-radius)] opacity-0 [background:var(--stepper-tile)] [box-shadow:inset_0_0_0_1px_var(--stepper-tile-edge),inset_0_1px_0_var(--stepper-tile-highlight),var(--stepper-tile-shadow)]';
const SEGMENT_CLASS = \`relative box-border flex min-w-0 cursor-pointer rounded-[var(--stepper-tile-radius)] border-none bg-transparent font-[inherit] \${MUTED} [transition:background-color_0.2s_ease] disabled:cursor-default [@media(hover:hover)]:[&:not(:disabled):hover]:[background:var(--stepper-hover-fill)] \${FOCUS}\`;
const SEGMENT_ROW = 'h-10 flex-[1_1_auto] items-center justify-center gap-2 px-2.5';
const SEGMENT_RAIL = 'h-auto flex-none items-start justify-start gap-2.5 p-2.5';
const BADGE_CLASS = \`grid h-[22px] w-[22px] flex-none place-items-center rounded-full text-[11.5px] leading-none font-semibold tabular-nums \${MUTED} [box-shadow:inset_0_0_0_1px_var(--stepper-faint)] [transition:background-color_0.15s_ease,box-shadow_0.15s_ease,color_0.15s_ease] data-[status=active]:text-[color:var(--stepper-ink)] data-[status=active]:[box-shadow:inset_0_0_0_1.5px_var(--stepper-ink)] data-[status=complete]:text-[color:var(--stepper-solid-ink)] data-[status=complete]:[background:var(--stepper-solid)] data-[status=complete]:[box-shadow:none]\`;
const TITLE_CLASS = 'overflow-hidden text-[13px] leading-[1.2] font-semibold text-ellipsis whitespace-nowrap transition-colors duration-200';
const DESCRIPTION_CLASS = \`overflow-hidden text-[12px] leading-[1.35] text-ellipsis whitespace-nowrap \${MUTED}\`;
const DOT_CLASS = \`group/dot grid h-[22px] w-[22px] cursor-pointer place-items-center rounded-full border-none bg-transparent p-0 disabled:cursor-default \${FOCUS}\`;
const DOT_MARK_CLASS = 'h-2 w-2 rounded-full [background:var(--stepper-faint)] [transition:background-color_0.25s_ease,transform_0.45s_var(--stepper-spring)] data-[status=active]:[background:var(--stepper-solid)] data-[status=active]:[transform:scale(1.3)] data-[status=complete]:[background:var(--stepper-muted)] motion-reduce:[transition-duration:0.01ms] [@media(hover:hover)]:group-[:not(:disabled):hover]/dot:[transform:scale(1.3)]';
const BAR_CLASS = \`group/bar flex h-[18px] flex-1 cursor-pointer items-center border-none bg-transparent p-0 disabled:cursor-default \${FOCUS}\`;
const BAR_TRACK_CLASS = 'relative h-1 w-full overflow-hidden rounded-[4px] [background:var(--stepper-track)] [@media(hover:hover)]:group-[:not(:disabled):hover]/bar:[background:var(--stepper-faint)]';
const BAR_FILL_CLASS = 'absolute inset-0 origin-left [background:var(--stepper-solid)] [transform:scaleX(0)] [transition:transform_560ms_var(--stepper-spring)] data-[filled]:[transform:none] motion-reduce:[transition-duration:0.01ms]';
const VIEWPORT_CLASS = 'relative -my-1.5 mx-[calc(var(--stepper-bleed)*-1)] overflow-hidden';
const PANE_CLASS = 'box-border px-[var(--stepper-bleed)] py-1.5 outline-none';
const LEAVING_CLASS = 'pointer-events-none absolute top-0 right-0 left-0';
const FOOTER_WRAP_CLASS = 'group/footer grid grid-rows-[1fr] [transition:grid-template-rows_480ms_var(--stepper-spring),opacity_0.2s_ease] data-[hidden]:pointer-events-none data-[hidden]:grid-rows-[0fr] data-[hidden]:opacity-0 motion-reduce:[transition-duration:0.01ms]';
const FOOTER_CLIP_CLASS = 'min-h-0 group-data-[hidden]/footer:overflow-hidden';
const FOOTER_CLASS = 'flex items-center justify-between gap-3 pt-5';
const BUTTON_CLASS = \`inline-flex h-[38px] flex-none cursor-pointer items-center gap-1.5 rounded-[max(8px,calc(var(--stepper-radius)*0.5))] border-none px-3.5 font-[inherit] text-[13.5px] leading-none font-semibold [transition:filter_0.2s_ease,transform_0.2s_ease,opacity_0.2s_ease] disabled:cursor-not-allowed disabled:opacity-40 active:enabled:[filter:var(--stepper-press)] active:enabled:[transform:scale(0.96)] active:enabled:duration-0 \${FOCUS}\`;
const BACK_CLASS = \`pl-2.5 \${INK} [background:var(--stepper-tile)] [box-shadow:inset_0_0_0_1px_var(--stepper-tile-edge),inset_0_1px_0_var(--stepper-tile-highlight),var(--stepper-tile-shadow)] hover:enabled:[filter:var(--stepper-hover)] data-[hidden]:invisible data-[hidden]:opacity-0 data-[hidden]:[transition:opacity_0.2s_ease,visibility_0s_0.2s]\`;
const NEXT_CLASS = 'ml-auto pr-[11px] text-[color:var(--stepper-solid-ink)] [background:var(--stepper-solid)] [box-shadow:0_4px_12px_-6px_rgba(0,0,0,0.5)] hover:enabled:[filter:var(--stepper-solid-hover)]';

function Check() {
  const ref = useRef<HTMLSpanElement>(null);
  useIsomorphicLayoutEffect(() => {
    const path = ref.current?.querySelector('path');
    if (!path || typeof path.animate !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    path.style.strokeDasharray = '24';
    path.animate([{ strokeDashoffset: 24 }, { strokeDashoffset: 0 }], {
      duration: 360,
      easing: SETTLE
    });
  }, []);
  return (
    <span ref={ref} className="grid place-items-center">
      <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2.4} />
    </span>
  );
}

export function Step({ children }: StepProps) {
  return <div className="min-w-0">{children}</div>;
}

/** Focus the first focusable input/select/textarea inside a container */
function focusFirstField(container: HTMLElement | null) {
  if (!container) return;
  const field = container.querySelector<HTMLElement>(
    'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [role="combobox"]:not([disabled])'
  );
  if (field) {
    field.focus();
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      field.select?.();
    }
  }
}

export default function Stepper({
  children,
  step,
  initialStep = 1,
  onStepChange = () => {},
  onFinalStepCompleted = () => {},
  indicator = 'numbers',
  orientation = 'horizontal',
  transition = 'slide',
  linear = false,
  disableStepIndicators = false,
  renderStepIndicator,
  showFooter = true,
  backButtonText = 'Back',
  nextButtonText = 'Continue',
  completeButtonText = 'Complete',
  backButtonProps = {},
  nextButtonProps = {},
  completedContent,
  theme = 'dark',
  accentColor,
  frame = true,
  radius = 24,
  width = '100%',
  className = '',
  stepCircleContainerClassName = '',
  stepContainerClassName = '',
  contentClassName = '',
  footerClassName = '',
  style,
  validateStep,
  ...rest
}: StepperProps) {
  const steps = Children.toArray(children).filter(isValidElement) as ReactElement<StepProps>[];
  const total = steps.length;
  const controlled = typeof step === 'number';
  const [internal, setInternal] = useState(initialStep);
  const current = clamp(Math.round(controlled ? step : internal), 1, total + 1);
  const completed = current > total;
  const vertical = orientation === 'vertical';
  const kind = vertical ? 'numbers' : indicator;
  const labelled = steps.some(entry => entry.props.title);
  const [compact, setCompact] = useState(false);
  const [tight, setTight] = useState(false);
  const rail = vertical && !compact;
  const [reached, setReached] = useState(current);
  if (current > reached) setReached(current);
  const [view, setView] = useState<View>({ step: current, previous: null, direction: 1, id: 0 });
  if (view.step !== current) {
    setView({ step: current