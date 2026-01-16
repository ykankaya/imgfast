=== ImageCDN Optimizer ===
Contributors: imagecdn
Tags: image optimization, cdn, webp, avif, performance, lazy loading, responsive images
Requires at least: 5.9
Tested up to: 6.4
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Automatically optimize and deliver images through ImageCDN's global edge network with WebP/AVIF conversion, responsive images, and lazy loading.

== Description ==

**ImageCDN Optimizer** is a lightweight WordPress plugin that automatically optimizes and delivers your images through ImageCDN's global content delivery network. No server configuration required - just enter your API key and your images are instantly optimized.

= Key Features =

* **Automatic Image Optimization** - All images are automatically compressed and optimized
* **WebP/AVIF Conversion** - Serve next-gen formats to supported browsers
* **Global CDN Delivery** - Images served from 200+ edge locations worldwide
* **Responsive Images** - Automatic srcset generation for all device sizes
* **Native Lazy Loading** - Built-in lazy loading support
* **Zero Configuration** - Works out of the box with any theme
* **Gutenberg Block** - Custom block for advanced image control
* **REST API** - Programmatic access to CDN URLs

= How It Works =

1. Install and activate the plugin
2. Enter your ImageCDN API key (get one free at imagecdn.io)
3. Enable the plugin
4. All your images are now served through ImageCDN

The plugin automatically rewrites image URLs in your content, thumbnails, and media library to use ImageCDN's optimization service.

= CDN URL Format =

Original: `https://yoursite.com/wp-content/uploads/photo.jpg`
Optimized: `https://cdn.imagecdn.io/your-key/wp-content/uploads/photo.jpg?w=800&q=80&f=auto`

= Transformation Parameters =

* `w` - Width in pixels
* `h` - Height in pixels
* `q` - Quality (1-100)
* `f` - Format (auto, webp, avif, jpeg, png)
* `fit` - Resize mode (cover, contain, fill)

== Installation ==

= From WordPress Dashboard =

1. Navigate to Plugins > Add New
2. Search for "ImageCDN Optimizer"
3. Click "Install Now" then "Activate"
4. Go to Settings > ImageCDN
5. Enter your API key and enable the plugin

= Manual Installation =

1. Download the plugin zip file
2. Upload to `/wp-content/plugins/imagecdn-optimizer/`
3. Activate through the Plugins menu
4. Configure in Settings > ImageCDN

= Getting an API Key =

1. Visit [imagecdn.io](https://imagecdn.io) and create an account
2. Navigate to your dashboard
3. Copy your Public API Key (starts with `imgcdn_pk_`)
4. Paste it in the plugin settings

== Frequently Asked Questions ==

= Do I need an ImageCDN account? =

Yes, you need a free ImageCDN account to use this plugin. Sign up at [imagecdn.io](https://imagecdn.io).

= Will this work with my theme? =

Yes! ImageCDN Optimizer works with any WordPress theme. It automatically rewrites image URLs without modifying your theme files.

= Does it work with page builders? =

Yes, the plugin works with Elementor, Divi, Beaver Builder, and other popular page builders.

= What image formats are supported? =

The plugin supports JPEG, PNG, GIF, and WebP. It can convert images to WebP or AVIF automatically.

= Will it affect my SEO? =

ImageCDN improves page speed which is a positive SEO factor. All images maintain their original URLs for SEO purposes.

= Can I use a custom domain? =

Yes, Pro plans support custom domains like `images.yoursite.com`.

= How do I exclude certain images? =

Go to Settings > ImageCDN > Advanced and add paths to exclude. One path per line.

= Is there a Gutenberg block? =

Yes! Search for "ImageCDN Image" in the block inserter for advanced control over individual images.

== Screenshots ==

1. Main settings page with API key configuration
2. Advanced settings for fine-tuning
3. Status page showing CDN configuration
4. Gutenberg block with optimization controls
5. Before/after comparison of optimized images

== Changelog ==

= 1.0.0 =
* Initial release
* Automatic URL rewriting for all images
* WebP/AVIF auto-conversion
* Responsive srcset support
* Native lazy loading
* Gutenberg block
* Admin settings interface
* REST API endpoints

== Upgrade Notice ==

= 1.0.0 =
Initial release of ImageCDN Optimizer.

== Privacy Policy ==

ImageCDN Optimizer sends image requests through ImageCDN's servers for optimization. No personal user data is collected or transmitted. See our full privacy policy at [imagecdn.io/privacy](https://imagecdn.io/privacy).

== Support ==

* Documentation: [docs.imagecdn.io](https://docs.imagecdn.io)
* Support: [support@imagecdn.io](mailto:support@imagecdn.io)
* GitHub: [github.com/imagecdn/wordpress-plugin](https://github.com/imagecdn/wordpress-plugin)
