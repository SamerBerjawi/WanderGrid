import { type ComponentPropsWithoutRef, type ReactNode } from "react"
import { ArrowRight } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import GlassPanel from "../glass/GlassPanel"

interface BentoGridProps extends ComponentPropsWithoutRef<"div"> {
  children: ReactNode
  className?: string
}

interface BentoCardProps extends ComponentPropsWithoutRef<"div"> {
  name?: string
  className?: string
  background?: ReactNode
  Icon?: React.ElementType
  description?: ReactNode
  href?: string
  cta?: string
  children?: ReactNode
  onClick?: () => void
}

const BentoGrid = ({ children, className, ...props }: BentoGridProps) => {
  return (
    <div
      className={cn(
        "grid w-full auto-rows-auto grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

const BentoCard = ({
  name,
  className,
  background,
  Icon,
  description,
  href,
  cta,
  children,
  onClick,
  ...props
}: BentoCardProps) => (
  <GlassPanel
    className={cn(
      "wg-glass-card rounded-[28px] overflow-hidden group relative flex flex-col justify-between transition-all duration-300",
      onClick ? "cursor-pointer active:scale-[0.99]" : "",
      className
    )}
    overrides={{ borderRadius: 28 }}
    padding="0px"
    onClick={onClick}
  >
    <div
      key={name}
      className="relative flex flex-col justify-between h-full w-full"
      {...props}
    >
    {background && <div className="absolute inset-0 pointer-events-none overflow-hidden">{background}</div>}
    
    {children ? (
      <div className="relative z-10 p-5 flex flex-col justify-between h-full w-full">
        {children}
      </div>
    ) : (
      <>
        <div className="p-5 relative z-10 flex flex-col justify-between h-full">
          <div className="flex transform-gpu flex-col gap-1.5 transition-all duration-300 lg:group-hover:-translate-y-2">
            {Icon && (
              <div className="w-10 h-10 rounded-2xl bg-primary-500/10 text-primary-500 flex items-center justify-center mb-1 transition-transform duration-300 group-hover:scale-110">
                <Icon className="h-5 w-5 origin-left transform-gpu text-primary-500" />
              </div>
            )}
            {name && (
              <h3 className="text-base font-bold tracking-tight text-light-text dark:text-dark-text">
                {name}
              </h3>
            )}
            {description && (
              <p className="text-xs text-light-text-secondary dark:text-dark-text-secondary font-medium">
                {description}
              </p>
            )}
          </div>

          {cta && (
            <div className="mt-4 flex w-full items-center text-xs font-bold text-primary-500 transition-all duration-300">
              {href ? (
                <a href={href} className="inline-flex items-center gap-1.5 hover:underline">
                  <span>{cta}</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </a>
              ) : (
                <div className="inline-flex items-center gap-1.5">
                  <span>{cta}</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                </div>
              )}
            </div>
          )}
        </div>
      </>
    )}

    {/* Ambient Glow on Hover */}
    <div className="pointer-events-none absolute inset-0 transform-gpu transition-opacity duration-300 opacity-0 group-hover:opacity-100 bg-gradient-to-br from-primary-500/[0.04] to-transparent" />
    </div>
  </GlassPanel>
)

export { BentoCard, BentoGrid }
