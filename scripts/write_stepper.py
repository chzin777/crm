import pathlib

content = r"""'use client';

import React, {
  useState,
  Children,
  useRef,
  useLayoutEffect,
  useEffect,
  HTMLAttributes,
  ReactNode,
  type ButtonHTMLAttributes,
  type CSSProperties,
} from 'react';
import { motion, AnimatePresence, Variants } from 'motion/react';
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

interface StepperProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  children?: ReactNode;
  initialStep?: number;
  onStepChange?: (step: number) => void;
  onFinalStepCompleted?: () => void | boolean | Promise<void | boolean>;
  backButtonText?: string;
  nextButtonText?: string;
  completeButtonText?: string;
  disableStepIndicators?: boolean;
  validateStep?: (step: number) => boolean;
  canProceed?: (step: number) => boolean;
  showFooter?: boolean;
  backButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  nextButtonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  completedContent?: ReactNode;
  cabecalho?: ReactNode;
  resumoMobile?: ReactNode;
  reservarFechar?: boolean;
  accentColor?: string;
  className?: string;
  contentClassName?: string;
  footerClassName?: string;
  renderStepIndicator?: (props: StepIndicatorProps) => ReactNode;
}

const BRAND_VARS: Record<string, string> = {
  '--stepper-surface': 'var(--surface, #ffffff)',
  '--stepper-border': 'var(--border, rgba(5, 22, 71, 0.12))',
  '--stepper-primary': 'var(--primary, #002187)',
  '--stepper-primary-2': 'var(--primary-2, #051647)',
  '--stepper-accent': 'var(--accent, #C4D600)',
  '--stepper-muted': 'var(--muted, #64748b)',
  '--stepper-ink': 'var(--foreground, #051647)',
};

export function Step({ children }: { children: ReactNode }) {
  return <div className="w-full">{children}</div>;
}

export default function Stepper({
  children,
  initialStep = 1,
  onStepChange = () => {},
  onFinalStepCompleted = () => {},
  backButtonText = 'Voltar',
  nextButtonText = 'Continuar',
  completeButtonText = 'Concluir',
  disableStepIndicators = false,
  validateStep,
  canProceed,
  showFooter = true,
  backButtonProps = {},
  nextButtonProps = {},
  completedContent,
  cabecalho,
  resumoMobile,
  reservarFechar = false,
  accentColor,
  className = '',
  contentClassName = '',
  footerClassName = '',
  renderStepIndicator,
  ...rest
}: StepperProps) {
  const [currentStep, setCurrentStep] = useState<number>(initialStep);
  const [direction, setDirection] = useState<number>(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const stepsArray = Children.toArray(children);
  const totalSteps = stepsArray.length;
  const isCompleted = currentStep > totalSteps;
  const isLastStep = currentStep === totalSteps;
  const blockedByCanProceed = canProceed ? !canProceed(currentStep) : false;
  const blockedByValidation = validateStep ? !validateStep(currentStep) : false;
  const bloqueado = blockedByCanProceed || blockedByValidation;

  const updateStep = (newStep: number) => {
    setCurrentStep(newStep);
    if (newStep <= totalSteps) onStepChange(newStep);
    if (newStep <= totalSteps && typeof window !== 'undefined') {
      requestAnimationFrame(() =>
        rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      );
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setDirection(-1);
      updateStep(currentStep - 1);
    }
  };

  const handleNext = () => {
    if (!isLastStep) {
      if (validateStep && !validateStep(currentStep)) return;
      setDirection(1);
      updateStep(currentStep + 1);
    }
  };

  const handleComplete = async () => {
    if (validateStep && !validateStep(currentStep)) return;
    const r = await onFinalStepCompleted();
    if (r === false) return;
    setDirection(1);
    setCurrentStep(totalSteps + 1);
  };

  const accentVars: Record<string, string> = accentColor
    ? {
        '--stepper-primary': accentColor,
        '--stepper-primary-2': accentColor,
      }
    : {};

  const { className: backClass = '', onClick: onBackClick, ...backRest } = backButtonProps;
  const { className: nextClass = '', onClick: onNextClick, ...nextRest } = nextButtonProps;

  const paneContent = (number: number) =>
    number > totalSteps ? (completedContent ?? null) : stepsArray[number - 1];

  return (
    <div
      {...rest}
      ref={rootRef}
      className={`w-full scroll-mt-20 ${className}`.trim()}
      style={{ ...BRAND_VARS, ...accentVars, ...(rest.style as CSSProperties | undefined) }}
    >
      <div className="overflow-hidden rounded-2xl border border-[var(--stepper-border)] bg-[var(--stepper-surface)] shadow-[0_8px_30px_rgba(5,22,71,0.08)]">
        {cabecalho && (
          <div className="border-b border-[var(--stepper-border)] px-4 py-3 sm:px-8">
            {cabecalho}
          </div>
        )}

        <div
          className={
            'flex w-full items-center gap-2 bg-gradient-to-r from-slate-50 to-white px-4 py-5 sm:px-8 sm:py-6 ' +
            (reservarFechar ? 'pr-14 sm:pr-14' : '')
          }
        >
          {stepsArray.map((_, index) => {
            const stepNumber = index + 1;
            const isNotLastStep = index < totalSteps - 1;
            return (
              <React.Fragment key={stepNumber}>
                {renderStepIndicator ? (
                  <div className="relative outline-none">
                    {renderStepIndicator({
                      step: stepNumber,
                      currentStep,
                      onStepClick: (clicked) => {
                        if (clicked > currentStep) return;
                        setDirection(-1);
                        updateStep(clicked);
                      },
                    })}
                  </div>
                ) : (
                  <StepIndicator
                    step={stepNumber}
                    disableStepIndicators={disableStepIndicators}
                    currentStep={currentStep}
                    onClickStep={(clicked) => {
                      if (clicked > currentStep) return;
                      setDirection(-1);
                      updateStep(clicked);
                    }}
                  />
                )}
                {isNotLastStep && <StepConnector isComplete={currentStep > stepNumber} />}
              </React.Fragment>
            );
          })}
        </div>

        <StepContentWrapper
          isCompleted={isCompleted}
          currentStep={currentStep}
          direction={direction}
          className={`px-4 sm:px-8 ${contentClassName}`.trim()}
        >
          {paneContent(currentStep)}
        </StepContentWrapper>

        {showFooter && !isCompleted && (
          <div
            className={
              'px-4 pb-6 sm:px-8 sm:pb-8 ' +
              'max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:border-t max-lg:border-[var(--stepper-border)] ' +
              'max-lg:bg-[var(--stepper-surface)]/95 max-lg:px-4 max-lg:pt-3 max-lg:shadow-[0_-4px_24px_rgba(5,22,71,0.10)] max-lg:backdrop-blur ' +
              'max-lg:pb-[calc(0.75rem+env(safe-area-inset-bottom))] ' +
              footerClassName
            }
          >
            {resumoMobile && (
              <div className="mb-2.5 flex items-center justify-between lg:hidden">
                {resumoMobile}
              </div>
            )}
            <div
              className={`flex gap-3 sm:mt-6 ${currentStep !== 1 ? 'justify-between' : 'justify-end'}`}
            >
              {currentStep !== 1 && (
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  {...backRest}
                  onClick={(event) => {
                    onBackClick?.(event);
                    if (!event.defaultPrevented) handleBack();
                  }}
                  className={`inline-flex min-h-[48px] cursor-pointer items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 max-lg:border max-lg:border-[var(--stepper-border)] ${backClass}`.trim()}
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={2} />
                  <span>{backButtonText}</span>
                </motion.button>
              )}
              <motion.button
                whileHover={{ scale: bloqueado ? 1 : 1.03 }}
                whileTap={{ scale: bloqueado ? 1 : 0.97 }}
                data-stepper="next"
                {...nextRest}
                onClick={(event) => {
                  onNextClick?.(event);
                  if (event.defaultPrevented) return;
                  if (isLastStep) handleComplete();
                  else handleNext();
                }}
                disabled={bloqueado}
                className={`inline-flex min-h-[48px] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-[var(--stepper-primary)] to-[var(--stepper-primary-2)] px-5 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_rgba(0,33,135,0.35)] transition disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none sm:flex-none ${nextClass}`.trim()}
              >
                <span>{isLastStep ? completeButtonText : nextButtonText}</span>
                <HugeiconsIcon
                  icon={isLastStep ? Tick02Icon : ArrowRight01Icon}
                  size={16}
                  strokeWidth={2}
                />
              </motion.button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface StepContentWrapperProps {
  isCompleted: boolean;
  currentStep: number;
  direction: number;
  children: ReactNode;
  className?: string;
}

function StepContentWrapper({
  isCompleted,
  currentStep,
  direction,
  children,
  className = '',
}: StepContentWrapperProps) {
  const [parentHeight, setParentHeight] = useState<number>(0);
  return (
    <motion.div
      style={{ position: 'relative', overflow: 'hidden' }}
      animate={{ height: isCompleted ? 0 : parentHeight }}
      transition={{ type: 'spring', duration: 0.4 }}
      className={className}
    >
      <AnimatePresence initial={false} mode="sync" custom={direction}>
        {!isCompleted && (
          <SlideTransition
            key={currentStep}
            direction={direction}
            onHeightReady={(h) => setParentHeight(h)}
          >
            {children}
          </SlideTransition>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface SlideTransitionProps {
  children: ReactNode;
  direction: number;
  onHeightReady: (height: number) => void;
}

function SlideTransition({ children, direction, onHeightReady }: SlideTransitionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  useIsomorphicLayoutEffect(() => {
    if (containerRef.current) onHeightReady(containerRef.current.offsetHeight);
  }, [children, onHeightReady]);
  return (
    <motion.div
      ref={containerRef}
      custom={direction}
      variants={stepVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.4 }}
      className="absolute left-0 right-0 top-0 px-4 pb-2 pt-6 sm:px-8"
    >
      {children}
    </motion.div>
  );
}

const stepVariants: Variants = {
  enter: (dir: number) => ({ x: dir >= 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: '0%', opacity: 1 },
  exit: (dir: number) => ({ x: dir >= 0 ? '-50%' : '50%', opacity: 0 }),
};

interface StepIndicatorPropsInternal {
  step: number;
  currentStep: number;
  onClickStep: (clicked: number) => void;
  disableStepIndicators?: boolean;
}

function StepIndicator({
  step,
  currentStep,
  onClickStep,
  disableStepIndicators = false,
}: StepIndicatorPropsInternal) {
  const status = currentStep === step ? 'active' : currentStep < step ? 'inactive' : 'complete';
  return (
    <motion.div
      onClick={() => {
        if (step !== currentStep && !disableStepIndicators) onClickStep(step);
      }}
      className="relative cursor-pointer outline-none"
      animate={status}
      initial={false}
    >
      <motion.div
        variants={{
          inactive: { scale: 1, backgroundColor: '#e2e8f0', color: '#94a3b8'