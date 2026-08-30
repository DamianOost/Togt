export const GROUNDED_TAB_ICON_SIZE = 25;

type GroundedTabBarLayoutInput = {
  bottomInset: number;
  fontScale: number;
  labelLineHeight: number;
  minimumBottomPadding: number;
  minimumHeight: number;
  topPadding: number;
};

export function resolveGroundedTabBarLayout({
  bottomInset,
  fontScale,
  labelLineHeight,
  minimumBottomPadding,
  minimumHeight,
  topPadding,
}: GroundedTabBarLayoutInput) {
  const paddingBottom = Math.max(bottomInset, minimumBottomPadding);
  const scaledLabelHeight = labelLineHeight * fontScale;
  const height = Math.ceil(Math.max(
    minimumHeight,
    topPadding + GROUNDED_TAB_ICON_SIZE + scaledLabelHeight + paddingBottom,
  ));

  return { height, paddingBottom, paddingTop: topPadding };
}
