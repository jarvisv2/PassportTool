import { createFileRoute } from '@tanstack/react-router'
import PassportPhotoTool from '../components/PassportPhotoTool'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return <PassportPhotoTool />
}
