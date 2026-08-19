import { Reveal } from '@kowork/design-system'

export function WallpaperLayer({
  assetId,
  url
}: {
  assetId: string
  url: string
}): React.JSX.Element {
  return (
    <Reveal contentKey={assetId} className="kw-wallpaper-layer" aria-hidden="true">
      <img className="kw-wallpaper-layer__image" src={url} alt="" />
    </Reveal>
  )
}
