import { Button } from './components/Button'
import { Disclosure } from './components/Disclosure'
import { IconButton } from './components/IconButton'
import { OrbitSquares } from './components/OrbitSquares'
import { Reveal } from './components/Reveal'
import { SelectableItem, SelectableList } from './components/SelectableList'
import { Surface } from './components/Surface'
import { SwapText } from './components/SwapText'
import { PLUGIN_UI_KIT_API_VERSION } from './version'

export const PluginUiKit = Object.freeze({
  apiVersion: PLUGIN_UI_KIT_API_VERSION,
  Reveal,
  Disclosure,
  SelectableList,
  SelectableItem,
  Surface,
  Button,
  IconButton,
  SwapText,
  OrbitSquares
})

export type PluginUiKit = typeof PluginUiKit
