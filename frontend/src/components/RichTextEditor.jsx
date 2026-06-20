import { EditorContent, NodeViewWrapper, ReactNodeViewRenderer, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import UnderlineExtension from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react'

const MIN_IMAGE_WIDTH_PERCENT = 20
const MAX_IMAGE_WIDTH_PERCENT = 100

const IMAGE_SIZE_PRESETS = [
  { label: 'Small', value: 40 },
  { label: 'Medium', value: 70 },
  { label: 'Full', value: 100 },
]

function clampWidthPercent(value) {
  return Math.min(MAX_IMAGE_WIDTH_PERCENT, Math.max(MIN_IMAGE_WIDTH_PERCENT, Math.round(value)))
}

function InlineImageView({ node, selected, updateAttributes, editor }) {
  const caption = node.attrs.caption || ''
  const widthPercent = node.attrs.width || null
  const figureRef = useRef(null)
  const [resizing, setResizing] = useState(false)

  function updateCaption(nextCaption) {
    const shouldSyncAlt = !node.attrs.alt || node.attrs.alt === 'Folklore image' || node.attrs.alt === caption

    updateAttributes({
      caption: nextCaption,
      title: nextCaption,
      ...(shouldSyncAlt ? { alt: nextCaption || 'Folklore image' } : {}),
    })
  }

  const startResize = useCallback(
    (event, side) => {
      event.preventDefault()
      event.stopPropagation()
      const figure = figureRef.current
      const container = figure?.parentElement
      if (!figure || !container) return

      const containerWidth = container.getBoundingClientRect().width
      const startWidth = figure.getBoundingClientRect().width
      const startX = event.clientX
      setResizing(true)

      function onPointerMove(moveEvent) {
        const delta = moveEvent.clientX - startX
        // Right handle grows when dragged right; left handle grows when dragged left.
        const nextWidthPx = side === 'left' ? startWidth - delta : startWidth + delta
        const nextPercent = clampWidthPercent((nextWidthPx / containerWidth) * 100)
        updateAttributes({ width: nextPercent })
      }

      function onPointerUp() {
        setResizing(false)
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerup', onPointerUp)
      }

      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
    },
    [updateAttributes],
  )

  const editable = editor?.isEditable !== false
  const showHandles = editable && (selected || resizing)

  return (
    <NodeViewWrapper
      ref={figureRef}
      as="figure"
      className={`rte-image-figure${selected ? ' ProseMirror-selectednode' : ''}${resizing ? ' is-resizing' : ''}`}
      data-media-id={node.attrs.mediaId || undefined}
      style={widthPercent ? { width: `${widthPercent}%` } : undefined}
    >
      <div className="rte-image-frame">
        <img
          src={node.attrs.src}
          alt={node.attrs.alt || 'Folklore image'}
          title={node.attrs.title || undefined}
          draggable="false"
        />
        {showHandles && (
          <>
            <span
              className="rte-image-resize-handle left"
              role="slider"
              tabIndex={-1}
              aria-label="Resize image"
              aria-valuemin={MIN_IMAGE_WIDTH_PERCENT}
              aria-valuemax={MAX_IMAGE_WIDTH_PERCENT}
              aria-valuenow={widthPercent || 100}
              onPointerDown={(event) => startResize(event, 'left')}
            />
            <span
              className="rte-image-resize-handle right"
              role="slider"
              tabIndex={-1}
              aria-label="Resize image"
              aria-valuemin={MIN_IMAGE_WIDTH_PERCENT}
              aria-valuemax={MAX_IMAGE_WIDTH_PERCENT}
              aria-valuenow={widthPercent || 100}
              onPointerDown={(event) => startResize(event, 'right')}
            />
            {widthPercent && <span className="rte-image-size-badge">{widthPercent}%</span>}
          </>
        )}
      </div>
      {showHandles && (
        <div className="rte-image-size-presets" contentEditable={false}>
          {IMAGE_SIZE_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={`rte-image-size-preset${(widthPercent || 100) === preset.value ? ' active' : ''}`}
              onMouseDown={(event) => {
                event.preventDefault()
                updateAttributes({ width: preset.value })
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
      <input
        type="text"
        className="rte-image-caption-input"
        value={caption}
        maxLength={240}
        placeholder="Add a caption (optional)"
        aria-label="Image caption"
        onChange={(event) => updateCaption(event.target.value)}
      />
    </NodeViewWrapper>
  )
}

const InlineImage = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(InlineImageView)
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      mediaId: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-media-id'),
        renderHTML: (attributes) => (attributes.mediaId ? { 'data-media-id': attributes.mediaId } : {}),
      },
      caption: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-caption'),
        renderHTML: (attributes) => (attributes.caption ? { 'data-caption': attributes.caption } : {}),
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const figure = element.matches('figure') ? element : element.closest('figure')
          const raw =
            figure?.getAttribute('data-width') || figure?.style?.width || element.getAttribute('data-width')
          const parsed = parseFloat(raw)
          return Number.isFinite(parsed) ? clampWidthPercent(parsed) : null
        },
        renderHTML: (attributes) => (attributes.width ? { 'data-width': attributes.width } : {}),
      },
    }
  },

  parseHTML() {
    const readImageAttributes = (element) => {
      const image = element.matches('img') ? element : element.querySelector('img')
      const figure = element.matches('figure') ? element : element.closest('figure')
      const figcaption = element.matches('figure') ? element.querySelector('figcaption') : null
      const rawWidth = figure?.getAttribute('data-width') || figure?.style?.width
      const parsedWidth = parseFloat(rawWidth)
      return {
        src: image?.getAttribute('src') || '',
        alt: image?.getAttribute('alt') || '',
        title: image?.getAttribute('title') || '',
        mediaId: element.getAttribute('data-media-id') || image?.getAttribute('data-media-id'),
        caption:
          figcaption?.textContent ||
          element.getAttribute('data-caption') ||
          image?.getAttribute('data-caption') ||
          '',
        width: Number.isFinite(parsedWidth) ? clampWidthPercent(parsedWidth) : null,
      }
    }

    return [
      {
        tag: 'figure.rte-image-figure',
        getAttrs: readImageAttributes,
      },
      {
        tag: 'figure[data-media-id]',
        getAttrs: readImageAttributes,
      },
      {
        tag: 'img[src]',
        getAttrs: readImageAttributes,
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const { alt, class: className, src, title } = HTMLAttributes
    const caption = HTMLAttributes['data-caption'] || ''
    const mediaId = HTMLAttributes['data-media-id'] || ''
    const width = HTMLAttributes['data-width'] || ''

    return [
      'figure',
      {
        class: 'rte-image-figure',
        ...(mediaId ? { 'data-media-id': mediaId } : {}),
        ...(width ? { 'data-width': width, style: `width: ${width}%;` } : {}),
      },
      [
        'img',
        {
          src,
          alt: alt || 'Folklore image',
          ...(title ? { title } : {}),
          ...(className ? { class: className } : {}),
        },
      ],
      ['figcaption', {}, caption || ''],
    ]
  },
})

function ToolbarButton({ onClick, active, title, children, disabled = false }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        if (!disabled) onClick()
      }}
      className={`rte-toolbar-btn${active ? ' active' : ''}`}
      title={title}
      aria-label={title}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="rte-toolbar-divider" />
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write here…',
  invalid,
  onImageUpload = null,
}) {
  const imageInputRef = useRef(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageError, setImageError] = useState('')

  const editor = useEditor({
    extensions: [
      // StarterKit v3 bundles Underline; disable it here since we register
      // UnderlineExtension explicitly below (avoids a duplicate-extension warning).
      StarterKit.configure({ heading: { levels: [2, 3] }, underline: false }),
      InlineImage.configure({
        allowBase64: false,
        HTMLAttributes: {
          class: 'rte-inline-image',
        },
      }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      UnderlineExtension,
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    onUpdate({ editor: ed }) {
      const html = ed.isEmpty ? '' : ed.getHTML()
      onChange(html)
    },
  })

  // Sync external value changes (e.g. loading a saved draft)
  useEffect(() => {
    if (!editor) return
    const current = editor.isEmpty ? '' : editor.getHTML()
    if ((value || '') !== current) {
      editor.commands.setContent(value || '', { emitUpdate: false })
    }
  }, [value, editor])

  if (!editor) return null

  async function handleImageSelected(event) {
    const file = event.target.files?.[0] || null
    event.target.value = ''
    if (!file || !onImageUpload) return

    setUploadingImage(true)
    setImageError('')
    try {
      const asset = await onImageUpload({ file, caption: '', altText: '' })
      if (!asset?.image_url) throw new Error('Image upload did not return a URL.')
      editor
        .chain()
        .focus()
        .setImage({
          src: asset.image_url,
          alt: asset.alt_text || 'Folklore image',
          title: asset.caption || '',
          mediaId: asset.media_id,
          caption: asset.caption || '',
        })
        .run()
    } catch (err) {
      setImageError(err.message || 'Could not insert image.')
    } finally {
      setUploadingImage(false)
    }
  }

  return (
    <div className={`rte-wrapper${invalid ? ' rte-invalid' : ''}`}>
      {onImageUpload && (
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          onChange={handleImageSelected}
        />
      )}
      <div className="rte-toolbar" role="toolbar" aria-label="Text formatting">
        {/* History */}
        <ToolbarButton title="Undo" onClick={() => editor.chain().focus().undo().run()}>
          <Undo2 size={16} strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton title="Redo" onClick={() => editor.chain().focus().redo().run()}>
          <Redo2 size={16} strokeWidth={2.25} />
        </ToolbarButton>

        <Divider />

        {/* Inline styles */}
        <ToolbarButton
          title="Bold"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={16} strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} strokeWidth={2.5} />
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={16} strokeWidth={2.5} />
        </ToolbarButton>

        <Divider />

        {/* Headings */}
        <ToolbarButton
          title="Heading"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 size={16} strokeWidth={2.4} />
        </ToolbarButton>
        <ToolbarButton
          title="Subheading"
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 size={16} strokeWidth={2.4} />
        </ToolbarButton>

        <Divider />

        {/* Alignment — left is the implicit default, so reflect it as active
            whenever no other alignment is set (otherwise the toolbar looks
            like nothing is selected even though the text is left-aligned). */}
        <ToolbarButton
          title="Align left"
          active={
            editor.isActive({ textAlign: 'left' }) ||
            (!editor.isActive({ textAlign: 'center' }) &&
              !editor.isActive({ textAlign: 'right' }) &&
              !editor.isActive({ textAlign: 'justify' }))
          }
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
        >
          <AlignLeft size={16} strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Align center"
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        >
          <AlignCenter size={16} strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Align right"
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        >
          <AlignRight size={16} strokeWidth={2.25} />
        </ToolbarButton>

        <Divider />

        {/* Lists */}
        <ToolbarButton
          title="Bullet list"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={16} strokeWidth={2.25} />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={16} strokeWidth={2.25} />
        </ToolbarButton>

        {onImageUpload && (
          <>
            <Divider />
            <ToolbarButton
              title={uploadingImage ? 'Uploading image' : 'Insert image'}
              disabled={uploadingImage}
              onClick={() => imageInputRef.current?.click()}
            >
              <ImagePlus size={16} strokeWidth={2.25} />
            </ToolbarButton>
          </>
        )}
      </div>

      <EditorContent editor={editor} className="rte-content" />
      {imageError && <p className="inline-error rte-inline-error">{imageError}</p>}
    </div>
  )
}
