import { useEffect, useState } from 'react'
import { motion } from 'motion/react'

/** The tags worth staggering. Deliberately a closed list of PHRASING-safe and
 *  block tags rather than `ElementType`: it keeps the `motion` proxy lookup
 *  below type-safe, and the proxy caches per tag, so no new component type is
 *  created on re-render (which would remount and restart the animation). */
type StaggerTag = 'div' | 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

/* Renders `text` one character at a time, each unblurring in sequence.

   THE ELEMENT IS CONFIGURABLE, and that is not a convenience - it is what lets
   a caller keep valid HTML. This used to hard-render a `motion.div`, i.e. FLOW
   content, so any heading or paragraph that wanted the effect had to wrap a
   `<div>` around its text, and the sweep's job (ruling 22: the element that IS
   the text becomes `<h1>`/`<p>`) became impossible here - `<p><div>...</div></p>`
   is invalid and the browser silently closes the `<p>` early.

   `as` fixes it from the component side rather than asking every call site to
   work around it: `as="span"` for text inside a sentence, `as="h1"` when the
   staggered text IS the heading. It defaults to `div` so no existing call site
   changes.

   The characters are always `motion.span` (phrasing content), so a `<p>` or an
   `<h1>` parent stays valid whatever `as` is set to. */
export const BlurredStagger = ({
  text,
  delay = 600,
  as = 'div',
  className,
}: {
  text: string
  delay?: number
  /** The wrapper element. Use a phrasing element (`span`) inline, or the
   *  semantic tag itself (`h1`, `p`) when the staggered text IS that element. */
  as?: StaggerTag
  className?: string
}) => {
  const [start, setStart] = useState(false)

  useEffect(() => {
    const timeout = setTimeout(() => setStart(true), delay)
    return () => clearTimeout(timeout)
  }, [delay])

  const MotionTag = motion[as]

  const headingText = text
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.015,
      },
    },
  }
  const letterAnimation = {
    hidden: {
      opacity: 0,
      filter: 'blur(10px)',
    },
    show: {
      opacity: 1,
      filter: 'blur(0px)',
    },
  }

  return (
    <MotionTag
      variants={container}
      initial="hidden"
      animate={start ? 'show' : 'hidden'}
      className={className ?? 'break-words whitespace-normal'}
    >
      {headingText.split('').map((char, index) => (
        <motion.span key={index} variants={letterAnimation} transition={{ duration: 0.3 }}>
          {char}
        </motion.span>
      ))}
    </MotionTag>
  )
}
