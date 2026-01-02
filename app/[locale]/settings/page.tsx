"use client"

import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useTranslations } from 'next-intl'

export default function SettingsPage() {
  const t = useTranslations('Settings')

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <h1 className="text-3xl font-bold mb-8">{t('title')}</h1>

      <Tabs defaultValue="general">
        <TabsList className="mb-8">
          <TabsTrigger value="general">{t('general')}</TabsTrigger>
          <TabsTrigger value="reading">{t('readingPreferences')}</TabsTrigger>
          <TabsTrigger value="account">{t('account')}</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('darkMode')}</Label>
              <p className="text-sm text-muted-foreground">{t('darkModeDesc')}</p>
            </div>
            <Switch />
          </div>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>{t('notifications')}</Label>
              <p className="text-sm text-muted-foreground">{t('notificationsDesc')}</p>
            </div>
            <Switch defaultChecked />
          </div>
        </TabsContent>

        <TabsContent value="reading" className="space-y-6">
          <div className="space-y-2">
            <Label>{t('defaultFontSize')}</Label>
            <Input type="number" defaultValue={16} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
