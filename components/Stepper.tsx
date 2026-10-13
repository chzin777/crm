"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Children, isValidElement, useState, type CSSProperties, type ReactElement, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";

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

interface StepperProps {
  children?: ReactNode;
  initialStep?: number;
  onStepChange?: (step: number) => void;
  onFinalStepCompleted?: () => void;
  indicator?: "numbers" | "dots" | "bars";
  orientation?: "horizontal" | "vertical";
  transition?: "slide" | "fade" | "none";
  linear?: boolean;
  disableStepIndicators?: boolean;
  renderStepIndicator?: (props: StepIndicatorProps) => ReactNode;
  showFooter?: boolean;
  backButtonText?: string;
  nextButtonText?: string;
  completeButtonText?: string;
  theme?: "dark" | "light";
  accentColor?: string;
  frame?: boolean;
  radius?: number;
  width?: number | string;
  className?: string;
  style?: CSSProperties;
  validateStep?: (step: number) => boolean;
}

export function Step({ children }: StepProps) {
  return <div className="min-w-0">{children}</div>;
}

export default function Stepper({
  children,
  initialStep = 1,
  onStepChange,
  onFinalStepCompleted,
  indicator = "numbers",
  orientation = "horizontal",
  transition = "slide",
  linear = false,
  disableStepIndicators = false,
  renderStepIndicator,
  showFooter = true,
  backButtonText = "Voltar",
  nextButtonText = "Continuar",
  completeButtonText = "Concluir",
  theme = "light",
  accentColor = "#C4D600",
  frame = false,
  radius = 24,
  width = "100%",
  className = "",
  style,
  validateStep,
}: StepperProps) {
  const steps = Children.toArray(children).filter(isValidElement) as ReactElement<StepProps>[];
  const total = steps.length;
  const [currentStep, setCurrentStep] = useState(Math.min(Math.max(initialStep, 1), total));
  const [direction, setDirection] = useState(1);
  const reduceMotion = useReducedMotion();
  const activeStep = steps[currentStep - 1];
  const vertical = orientation === "vertical";
  const rootStyle = {
    width: typeof width === "number" ? `${width}px` : width,
    height: "100%",
    maxWidth: "100%",
    borderRadius: radius,
    "--stepper-accent": accentColor,
    ...style,
  } as CSSProperties;

  const navigate = (targetStep: number) => {
    const nextStep = Math.min(Math.max(targetStep, 1), total);
    if (nextStep === currentStep) return;
    if (linear && nextStep > currentStep + 1) return;
    if (nextStep > currentStep && validateStep) {
      for (let stepToValidate = currentStep; stepToValidate < nextStep; stepToValidate += 1) {
        if (!validateStep(stepToValidate)) return;
      }
    }
    setDirection(nextStep > currentStep ? 1 : -1);
    setCurrentStep(nextStep);
    onStepChange?.(nextStep);
  };

  const advance = () => {
    if (currentStep === total) {
      if (validateStep && !validateStep(currentStep)) return;
      onFinalStepCompleted?.();
      return;
    }
    navigate(currentStep + 1);
  };

  const themeClasses = theme === "dark"
    ? "border-white/10 bg-[#07194f] text-slate-100"
    : frame
      ? "border-slate-200 bg-white text-slate-800"
      : "border-transparent bg-transparent text-slate-800";

  return (
    <div
      className={`flex h-full w-[min(100%,var(--stepper-width))] min-h-0 min-w-0 flex-col ${frame ? `rounded-[${radius}px] border p-4 shadow-sm` : ""} ${themeClasses} ${className}`}
      style={{ ...rootStyle, "--stepper-width": typeof width === "number" ? `${width}px` : width } as CSSProperties}
    >
      <div role="tablist" aria-label="Etapas do formulário" className={`flex shrink-0 gap-2 ${vertical ? "flex-col" : "items-start"}`}>
        {steps.map((step, index) => {
          const number = index + 1;
          const complete = number < currentStep;
          const active = number === currentStep;
          const disabled = disableStepIndicators || (linear && number > currentStep + 1);
          const statusClass = active
            ? "border-[var(--stepper-accent)] bg-[var(--stepper-accent)] text-[#051647]"
            : complete
              ? "border-[#002187] bg-[#002187] text-white dark:border-[var(--stepper-accent)] dark:bg-[var(--stepper-accent)] dark:text-[#051647]"
              : "border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400";
          return (
            <div key={number} className={`flex min-w-0 ${vertical ? "items-start gap-3" : "flex-1 items-center gap-2"}`}>
              {renderStepIndicator ? (
                <div>{renderStepIndicator({ step: number, currentStep, onStepClick: navigate })}</div>
              ) : (
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-current={active ? "step" : undefined}
                  aria-label={typeof step.props.title === "string" ? `Etapa ${number}: ${step.props.title}` : `Etapa ${number}`}
                  disabled={disabled}
                  onClick={() => navigate(number)}
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border text-xs font-bold transition-colors cursor-pointer hover:cursor-pointer disabled:cursor-default ${statusClass}`}
                >
                  {indicator === "numbers"
                    ? complete ? <Check className="h-4 w-4" /> : step.props.icon ?? number
                    : indicator === "dots"
                      ? <span className={`h-2.5 w-2.5 rounded-full ${active || complete ? "bg-current" : "bg-slate-400 dark:bg-slate-500"}`} />
                      : <span className={`h-1 w-5 rounded-full ${active || complete ? "bg-current" : "bg-slate-400 dark:bg-slate-500"}`} />}
                </button>
              )}
              <div className={`min-w-0 ${vertical ? "pt-0.5" : "hidden sm:block"}`}>
                <p className={`truncate text-xs font-semibold ${active || complete ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>{step.props.title}</p>
                {step.props.description && <p className="mt-0.5 truncate text-[10px] text-slate-400">{step.props.description}</p>}
              </div>
              {!vertical && number < total && (
                <span aria-hidden="true" className={`h-px min-w-2 flex-1 ${complete ? "bg-[#002187] dark:bg-[#C4D600]" : "bg-slate-200 dark:bg-slate-700"}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className={`${frame ? "mt-5" : "mt-4"} min-h-0 flex-1 overflow-y-auto`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={currentStep}
            initial={transition === "none" || reduceMotion ? { opacity: 1 } : { opacity: 0, x: transition === "slide" ? direction * 18 : 0 }}
            animate={{ opacity: 1, x: 0 }}
            exit={transition === "none" || reduceMotion ? { opacity: 1 } : { opacity: 0, x: transition === "slide" ? direction * -18 : 0 }}
            transition={{ duration: transition === "none" || reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="min-w-0"
          >
            {activeStep?.props.children}
          </motion.div>
        </AnimatePresence>
      </div>

      {showFooter && (
        <div className="mt-5 flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-700">
          <button
            type="button"
            onClick={() => navigate(currentStep - 1)}
            disabled={currentStep <= 1}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer hover:cursor-pointer"
          >
            <ArrowLeft className="h-3.5 w-3.5" />{backButtonText}
          </button>
          <span className="text-[10px] font-medium text-slate-400">{currentStep} de {total}</span>
          <button
            type="button"
            onClick={advance}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#051647] px-3.5 text-xs font-semibold text-white transition-colors hover:bg-[#002187] dark:bg-[var(--stepper-accent)] dark:text-[#051647] dark:hover:brightness-95 cursor-pointer hover:cursor-pointer"
          >
            {currentStep === total ? completeButtonText : nextButtonText}
            {currentStep === total ? <Check className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}
