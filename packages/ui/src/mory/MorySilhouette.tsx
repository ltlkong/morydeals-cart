import Svg, { Circle, Ellipse, Path } from "react-native-svg";

import { colors } from "../theme/tokens";

/** Faces a silhouette can wear: eyes open, eyes shut (smiling arcs), a wink. */
export const SILHOUETTE_FACES = 3;

type Props = { size: number; face?: number; body?: string; detail?: string };

/**
 * Mory as a flat two-tone shape (body and orange in one grey, face and leaves in a fainter one), on the same
 * 200-grid as MoryFigure: a still decoration for backgrounds, never a character on its own.
 */
export function MorySilhouette({
  size,
  face = 0,
  body = colors.fieldBody,
  detail = colors.fieldFace,
}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200">
      <Path d="M100 62 C87 38 63 35 53 42 C54 61 79 75 100 62Z" fill={body} />
      <Path
        d="M100 62 C103 36 124 24 143 26 C143 51 124 70 100 65Z"
        fill={body}
      />
      <Circle cx={100} cy={75} r={17.5} fill={body} />
      <Ellipse cx={100} cy={126} rx={62} ry={56} fill={body} />
      {face === 1 ? (
        <>
          <Path
            d="M76 120 Q 82 112, 88 120"
            stroke={detail}
            strokeWidth={4}
            strokeLinecap="round"
            fill="none"
          />
          <Path
            d="M112 120 Q 118 112, 124 120"
            stroke={detail}
            strokeWidth={4}
            strokeLinecap="round"
            fill="none"
          />
        </>
      ) : (
        <>
          <Ellipse cx={82} cy={118} rx={5} ry={9} fill={detail} />
          {face === 2 ? (
            <Path
              d="M112 119 L 124 119"
              stroke={detail}
              strokeWidth={4}
              strokeLinecap="round"
            />
          ) : (
            <Ellipse cx={118} cy={118} rx={5} ry={9} fill={detail} />
          )}
        </>
      )}
    </Svg>
  );
}
