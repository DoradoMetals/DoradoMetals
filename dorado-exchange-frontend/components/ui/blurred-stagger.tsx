import { useEffect, useState } from 'react'
import { motion } from 'motion/react'

export const BlurredStagger = ({
  text = 'we love hextaui.com ❤️',
  delay = 600, // ← delay in ms before starting animation
}: {
  text: string
  delay?: number
}) => {
  const [start, setStart] = useState(false)

  useEffect(() => {
    const timeout = setTimeout(() => setStart(true), delay)
    return () => clearTimeout(timeout)
  }, [delay])

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
    <motion.div
      variants={container}
      initial="hidden"
      animate={start ? 'show' : 'hidden'}
      className="break-words whitespace-normal"
    >
      {headingText.split('').map((char, index) => (
        <motion.span
          key={index}
          variants={letterAnimation}
          transition={{ duration: 0.3 }}
          className="inline-block"
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
    </motion.div>
  )
}
