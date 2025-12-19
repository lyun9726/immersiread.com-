import { NextRequest, NextResponse } from 'next/server'

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1'

export async function POST(request: NextRequest) {
    try {
        const apiKey = process.env.ELEVENLABS_API_KEY

        if (!apiKey) {
            return NextResponse.json(
                { error: 'ElevenLabs API key not configured' },
                { status: 500 }
            )
        }

        // Parse the multipart form data from client
        const formData = await request.formData()
        const name = formData.get('name') as string
        const audioFile = formData.get('audio') as File
        const description = formData.get('description') as string | null

        if (!name || !audioFile) {
            return NextResponse.json(
                { error: 'Name and audio file are required' },
                { status: 400 }
            )
        }

        // Create FormData for ElevenLabs API
        const elevenLabsFormData = new FormData()
        elevenLabsFormData.append('name', name)
        elevenLabsFormData.append('files', audioFile, audioFile.name || 'audio.webm')

        if (description) {
            elevenLabsFormData.append('description', description)
        }

        // Optional: Remove background noise (be careful with this)
        elevenLabsFormData.append('remove_background_noise', 'false')

        // Call ElevenLabs API to create voice clone
        const response = await fetch(`${ELEVENLABS_API_URL}/voices/add`, {
            method: 'POST',
            headers: {
                'xi-api-key': apiKey,
            },
            body: elevenLabsFormData,
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            console.error('[VoiceClone] ElevenLabs API error:', response.status, errorData)

            if (response.status === 401) {
                return NextResponse.json(
                    { error: 'Invalid ElevenLabs API key' },
                    { status: 401 }
                )
            }

            if (response.status === 422) {
                return NextResponse.json(
                    { error: 'Audio file format not supported or too short' },
                    { status: 422 }
                )
            }

            return NextResponse.json(
                { error: errorData.detail?.message || 'Failed to create voice clone' },
                { status: response.status }
            )
        }

        const data = await response.json()

        console.log('[VoiceClone] Successfully created voice:', data.voice_id)

        return NextResponse.json({
            success: true,
            voiceId: data.voice_id,
            name: name,
        })

    } catch (error) {
        console.error('[VoiceClone] Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

// Get list of cloned voices
export async function GET() {
    try {
        const apiKey = process.env.ELEVENLABS_API_KEY

        if (!apiKey) {
            return NextResponse.json(
                { error: 'ElevenLabs API key not configured' },
                { status: 500 }
            )
        }

        const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
            headers: {
                'xi-api-key': apiKey,
            },
        })

        if (!response.ok) {
            return NextResponse.json(
                { error: 'Failed to fetch voices' },
                { status: response.status }
            )
        }

        const data = await response.json()

        // Filter to only show cloned voices (not default ones)
        const clonedVoices = data.voices?.filter((voice: any) =>
            voice.category === 'cloned' || voice.category === 'professional'
        ) || []

        return NextResponse.json({
            voices: clonedVoices.map((voice: any) => ({
                id: voice.voice_id,
                name: voice.name,
                description: voice.description,
                labels: voice.labels,
                previewUrl: voice.preview_url,
            })),
        })

    } catch (error) {
        console.error('[VoiceClone] Error fetching voices:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
