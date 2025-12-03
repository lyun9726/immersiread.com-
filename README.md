# AI Reading Assistant - Frontend Skeleton

This is the frontend structure for the AI Reading Assistant application, built with Next.js (App Router) and Tailwind CSS.

## Project Structure

- `/app`: Application routes and pages.
  - `/reader/[bookId]`: The core reading interface.
  - `/upload`: File upload and URL ingest.
  - `/voices`: Voice cloning and management.
- `/components`: Reusable UI components.
  - `/reader`: Components specific to the reading interface (BottomBar, Block, SidePanel).
  - `/voice`: Components for voice management.
- `/data`: Static data placeholders (languages, presets).

## API Integration Points

To fully functionalize this application, connect the following UI actions to your backend endpoints:

### Ingest & Parsing
- **POST** `/api/ingest/url`: Hook up in `app/web-reader/page.tsx` and `app/upload/page.tsx` to process URLs.
- **POST** `/api/ingest/file`: Hook up in `app/upload/page.tsx` for file uploads.
- **GET** `/api/reader/book/[id]`: Retrieve parsed book content for `app/reader/[bookId]/page.tsx`.

### AI & TTS
- **POST** `/api/tts/synthesize`: Hook up to the Play button in `components/reader/bottom-control-bar.tsx` and `components/reader/block-component.tsx`.
- **POST** `/api/translate/batch`: Hook up to the translation actions in `components/reader/right-side-panel.tsx`.
- **POST** `/api/voice-clone/create`: Hook up to the `CloneVoiceModal` in `components/voice/clone-voice-modal.tsx`.
- **POST** `/api/ask`: Hook up to the chat interface in `app/ask/page.tsx` and the AI tab in the reader sidebar.

## Development

Run the development server:

\`\`\`bash
npm run dev
\`\`\`

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.
