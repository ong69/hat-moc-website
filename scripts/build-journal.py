"""Render the Hạt Mộc journal and update its sitemap entries."""
import argparse
import json
import re
import xml.etree.ElementTree as ET
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JOURNAL = ROOT / 'journal'
ORIGIN = 'https://www.hatmoc.com'
HUB = '/journal/index.html'
NS = 'http://www.sitemaps.org/schemas/sitemap/0.9'
PRODUCT_LINKS = {'coffee': ('/#shop-coffee', 'Shop coffee beans'),
                 'cashews': ('/#shop-cashews', 'Shop roasted cashews'),
                 'collection': ('/#shop', 'Shop the collection')}
ANALYTICS_ID = 'G-MHPHHCJVQQ'
CATEGORIES = ('Shopping guides', 'Coffee culture', 'Brewing guides', 'Cashew guides')
HUB_IMAGE = {'src': '/assets/journal/cafe.webp',
             'alt': 'Coffee and cashews on a table in a Hanoi-style courtyard'}
FEATURE_IMAGE = {'src': '/assets/journal/iced.webp',
                 'alt': 'A glass of Vietnamese iced coffee with a phin in the background'}
SOURCES = {
    'vietnamese-coffee-culture': [('Vietnam Tourism · The story behind Vietnam’s coffee culture', 'https://vietnam.travel/things-to-do/taste-vietnam-story-behind-its-beloved-coffee-culture/')],
    'five-vietnamese-coffee-recipes': [('Vietnam Tourism · Five Vietnamese coffees', 'https://vietnam.travel/things-to-do/5-fantastic-vietnamese-coffees/')],
    'vietnamese-coffee-culture-australia': [('Sydney.com · Vietnamese food and coffee in Cabramatta', 'https://www.sydney.com/things-to-do/tours/mia-cucina-food-tours/vietnamese-food-tour')],
    'what-makes-vietnamese-cashews-special': [('IP Vietnam · Registered geographical indications', 'https://ipvietnam.gov.vn/vi_VN/web/english/domestic-ip-activities/-/asset_publisher/ZMuTgR44COLR/content/list-of-geographical-indications-protected-in-vietnam-')],
}

def url(article):
    return f"/journal/{article['slug']}.html"

def img(image, eager=False):
    path, alt = image['src'], image['alt']
    hint = 'fetchpriority="high"' if eager else 'loading="lazy"'
    return f'<img src="{escape(path)}" alt="{escape(alt)}" {hint} decoding="async">'

def heading(value):
    # Keep final words together on narrow screens without forcing manual line breaks.
    words = value.split()
    if len(words) < 3:
        return escape(value)
    return f'{escape(" ".join(words[:-2]))} {escape(words[-2])}&nbsp;{escape(words[-1])}'

def layout(path, title, description, image, content, schema):
    canonical = ORIGIN + path
    metadata = json.dumps(schema, ensure_ascii=False).replace('<', '\\u003c')
    return f"""<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)} | Hạt Mộc</title>
<meta name="description" content="{escape(description)}">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="{'article' if schema['@type'] == 'Article' else 'website'}">
<meta property="og:title" content="{escape(title)} | Hạt Mộc">
<meta property="og:description" content="{escape(description)}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{ORIGIN + image['src']}">
<meta property="og:image:alt" content="{escape(image['alt'])}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#12372a">
<link rel="stylesheet" href="/journal/journal.css">
<script async src="https://www.googletagmanager.com/gtag/js?id={ANALYTICS_ID}"></script>
<script>
window.dataLayer = window.dataLayer || [];
function gtag() {{ window.dataLayer.push(arguments); }}
gtag('js', new Date());
gtag('config', '{ANALYTICS_ID}');
document.addEventListener('click', event => {{
  const link = event.target.closest('a[href^="/#shop"]');
  if (link) gtag('event', 'journal_shop_click', {{link_url: link.href}});
}});
</script>
<script type="application/ld+json">{metadata}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="masthead"><div class="frame masthead-inner">
<a class="brand" href="/">Hạt Mộc</a>
<nav aria-label="Main navigation"><a href="{HUB}">Coffee &amp; Culture</a><a class="shop-link" href="/#shop">Shop</a></nav>
</div></header>
{content}
<footer class="site-footer"><div class="frame footer-inner">
<a class="brand" href="/">Hạt Mộc</a>
<nav aria-label="Footer"><a href="{HUB}">Coffee &amp; Culture</a><a href="/customer-information.html#tab-delivery">Pickup &amp; delivery</a><a href="/#shop">Shop the collection</a></nav>
</div></footer>
</body>
</html>
"""

def card(article):
    return f"""<article class="card">
<a href="{url(article)}"><div class="card-image">{img(article['image'])}</div>
<div class="card-body"><p class="kicker">{escape(article['category'])}</p>
<h3>{heading(article['title'])}</h3><p class="summary">{escape(article['intro'])}</p>
<span class="card-arrow" aria-hidden="true">↗</span></div></a></article>"""

def article_page(article, by_slug):
    path = url(article)
    title = article['title']
    description = article['intro']
    image = article['image']
    sections = article['sections']
    minutes = max(1, round(sum(len(body.split()) for _, body in sections) / 185))
    toc = ''.join(f'<li><a href="#section-{index}">{escape(label)}</a></li>'
                  for index, (label, _) in enumerate(sections, 1))
    chunks = ''.join(f'<section id="section-{index}"><h2>{heading(label)}</h2><p>{escape(body)}</p></section>'
                     for index, (label, body) in enumerate(sections, 1))
    source_entries = article.get('sources', SOURCES.get(article['slug'], []))
    sources = ''
    if source_entries:
        items = ''.join(f'<li><a href="{escape(href)}">{escape(label)}</a></li>' for label, href in source_entries)
        sources = f'<aside class="sources"><h2>Further reading</h2><ul>{items}</ul></aside>'
    related = ''.join(card(by_slug[slug]) for slug in article['related'])
    tone = {'Shopping guides': 'shopping', 'Coffee culture': 'culture',
            'Brewing guides': 'brewing', 'Cashew guides': 'cashew'}[article['category']]
    product_url, product_label = PRODUCT_LINKS[article['product']]
    content = f"""<main id="main" class="{tone} article-page">
<div class="frame crumbs"><a href="{HUB}">Coffee &amp; Culture</a><span aria-hidden="true">/</span><span>{escape(article['category'])}</span></div>
<article>
<div class="frame article-hero">
<div class="hero-copy"><p class="kicker">{escape(article['category'])} · {minutes} min read</p>
<h1>{heading(title)}</h1><p class="lede">{escape(description)}</p></div>
<div class="hero-image">{img(image, eager=True)}</div></div>
<div class="frame reading-layout">
<nav class="contents" aria-label="In this guide"><p class="kicker">In this guide</p><ul>{toc}</ul></nav>
<div class="prose">{chunks}{sources}</div>
</div>
</article>
<div class="frame"><section class="shop-panel" aria-label="Shop Hạt Mộc">
<div><p class="kicker">From the Hạt Mộc shop</p><h2>{heading(article['cta'])}</h2><p>Free Bankstown pickup and Australia-wide postage.</p></div>
<a class="button" href="{product_url}">{product_label} <span aria-hidden="true">↗</span></a></section>
<section class="related"><h2>Keep reading</h2><div class="cards">{related}</div></section></div>
</main>"""
    schema = {
        '@context': 'https://schema.org', '@type': 'Article',
        'headline': title, 'description': description, 'image': ORIGIN + image['src'],
        'inLanguage': 'en-AU', 'mainEntityOfPage': ORIGIN + path,
        'author': {'@type': 'Organization', 'name': 'Hạt Mộc', 'url': ORIGIN + '/'},
        'publisher': {'@type': 'Organization', 'name': 'Hạt Mộc', 'url': ORIGIN + '/'},
    }
    if 'published' in article:
        schema['datePublished'] = article['published']
    return layout(path, title, description, image, content, schema)

def hub_page(articles, by_slug):
    title = 'Coffee & Culture'
    description = 'Explore Vietnamese coffee, phin brewing and roasted cashews. Find recipes and shopping guides for Bankstown, Sydney and Australia.'
    featured = by_slug['five-vietnamese-coffee-recipes']
    sections = ''
    for category in CATEGORIES:
        anchor = category.lower().replace(' ', '-')
        matching = [item for item in articles if item['category'] == category]
        if not matching:
            continue
        cards = ''.join(card(item) for item in matching)
        sections += f'<section class="frame chapter" id="{anchor}"><h2>{category}</h2><div class="cards">{cards}</div></section>'
    menu = ''.join(f'<a href="#{category.lower().replace(" ", "-")}">{category}</a>' for category in CATEGORIES)
    content = f"""<main id="main">
<section class="journal-hero"><div class="frame journal-hero-inner">
<div class="hero-copy"><p class="kicker">The Hạt Mộc journal</p>
<h1>Coffee &amp;&nbsp;Culture</h1>
<p class="lede">Vietnamese coffee rituals, the perfect phin pour and a good handful of roasted&nbsp;cashews.</p>
<a class="button" href="#shopping-guides">Explore the guides <span aria-hidden="true">↓</span></a>
</div><div class="hero-image">{img(HUB_IMAGE, eager=True)}</div></div></section>
<nav class="frame chapter-nav" aria-label="Journal topics">{menu}</nav>
<div class="frame">
<a class="feature" href="{url(featured)}">
<div class="feature-image">{img(FEATURE_IMAGE)}</div>
<div class="feature-copy"><p class="kicker">From the recipe collection</p><h2>{heading(featured['title'])}</h2>
<p>{escape(featured['intro'])}</p><span class="feature-link">Get the recipes <span aria-hidden="true">↗</span></span></div></a></div>
{sections}
</main>"""
    schema = {'@context': 'https://schema.org', '@type': 'CollectionPage', 'name': title,
              'description': description, 'url': ORIGIN + HUB, 'inLanguage': 'en-AU'}
    return layout(HUB, title, description, HUB_IMAGE, content, schema)

def sitemap(articles):
    ET.register_namespace('', NS)
    tree = ET.parse(ROOT / 'sitemap.xml')
    root = tree.getroot()
    tag = f'{{{NS}}}'
    for entry in list(root):
        loc = entry.findtext(tag + 'loc', '')
        if loc.startswith(ORIGIN + '/journal/'):
            root.remove(entry)
    for path in [HUB, *(url(item) for item in articles)]:
        entry = ET.SubElement(root, tag + 'url')
        ET.SubElement(entry, tag + 'loc').text = ORIGIN + path
    ET.indent(tree, space='  ')
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding='unicode') + '\n'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Check that all generated files are current')
    args = parser.parse_args()
    articles = json.loads((JOURNAL / 'articles.json').read_text())
    by_slug = {article['slug']: article for article in articles}
    if len(by_slug) != len(articles) or 'index' in by_slug:
        raise SystemExit('Duplicate or reserved journal slug')
    seen_images = {HUB_IMAGE['src'], FEATURE_IMAGE['src']}
    for article in articles:
        slug = article['slug']
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', slug):
            raise SystemExit(f'Invalid journal slug: {slug}')
        if article['category'] not in CATEGORIES or article['product'] not in PRODUCT_LINKS:
            raise SystemExit(f'Unknown category or product: {slug}')
        image = article.get('image')
        if not isinstance(image, dict) or not isinstance(image.get('alt'), str) or not image['alt'].strip():
            raise SystemExit(f'Provide an image with a descriptive alt text: {slug}')
        src = image.get('src')
        if not isinstance(src, str) or not re.fullmatch(r'/assets/journal/[a-z0-9-]+\.webp', src):
            raise SystemExit(f'Use a local journal WebP image: {slug}')
        if src in seen_images or not (ROOT / src.lstrip('/')).is_file():
            raise SystemExit(f'Duplicate or missing image: {slug}')
        seen_images.add(src)
        if len(article['sections']) < 3 or len(set(article['related'])) != 3:
            raise SystemExit(f'Provide three sections and three distinct related articles: {slug}')
        if any(related not in by_slug or related == slug for related in article['related']):
            raise SystemExit(f'Invalid related article: {slug}')
        for _, href in article.get('sources', []):
            if not href.startswith('https://'):
                raise SystemExit(f'Invalid source URL: {slug}')
    output = {
        ROOT / 'sitemap.xml': sitemap(articles),
        JOURNAL / 'index.html': hub_page(articles, by_slug),
        **{ROOT / url(item).lstrip('/'): article_page(item, by_slug) for item in articles},
    }
    for path, content in output.items():
        if args.check:
            if not path.is_file() or path.read_text() != content:
                raise SystemExit(f'Stale generated file: {path.relative_to(ROOT)}')
        else:
            path.write_text(content)

if __name__ == '__main__':
    main()
