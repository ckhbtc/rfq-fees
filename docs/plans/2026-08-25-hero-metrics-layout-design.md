# Hero metrics layout

The dashboard hero keeps its existing editorial structure, typography, metric order, and data behavior. At desktop widths, the six metric summaries use a three-column grid so they render as two rows of three. The headline is reduced from 76px to 68px to give the metrics more visual balance while preserving it as the dominant element.

At mobile widths, the existing single-column hero remains in place and the metrics grid explicitly falls back to two columns. This avoids squeezing labels and supporting text into narrow three-column cards. Verification covers the existing automated test suite, the production build, and a desktop browser render confirming three cards per row and the 68px headline size.
