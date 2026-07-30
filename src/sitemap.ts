import type { RouteNode } from './types'
import { collectUrlPaths } from './core/scanner'

export interface SitemapOptions {
  baseUrl: string
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never'
  priority?: number
  exclude?: string[]
  lastmod?: string
}

/**
 * Generate a sitemap.xml string from the route tree.
 * Useful for static site generation and SEO.
 * Excludes dynamic routes (with :params) by default.
 */
export function generateSitemap(root: RouteNode, options: SitemapOptions): string {
  const { baseUrl, changefreq = 'weekly', priority = 0.8, exclude = [], lastmod } = options
  const paths = collectUrlPaths(root)
  const staticPaths = paths.filter((p) => !p.includes(':') && !exclude.includes(p))
  const normalizedBase = baseUrl.replace(/\/$/, '')

  const urls = staticPaths.map((path) => {
    const loc = `${normalizedBase}${path}`
    const parts = [`    <loc>${loc}</loc>`]
    if (lastmod) parts.push(`    <lastmod>${lastmod}</lastmod>`)
    parts.push(`    <changefreq>${changefreq}</changefreq>`)
    parts.push(`    <priority>${priority}</priority>`)
    return `  <url>\n${parts.join('\n')}\n  </url>`
  })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    '</urlset>',
    '',
  ].join('\n')
}
