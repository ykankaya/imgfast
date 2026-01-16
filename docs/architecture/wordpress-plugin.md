# ImageCDN WordPress Plugin Architecture

## Overview

The WordPress plugin is a **thin client** that integrates ImageCDN with WordPress sites. It does NOT perform any image processing - all optimization happens on the CDN edge.

## Core Principles

1. **No Image Processing** - Plugin only rewrites URLs
2. **Minimal Footprint** - Lightweight, fast activation
3. **Non-Destructive** - Original images remain untouched
4. **Easy Rollback** - Disable plugin = instant revert to original URLs
5. **WordPress Standards** - Follow WP coding standards and best practices

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     WordPress Site                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  Admin Settings │  │  URL Rewriter   │  │  Gutenberg      │ │
│  │  Page           │  │  (Filters)      │  │  Block          │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
│           │                    │                    │           │
│           └────────────────────┼────────────────────┘           │
│                                │                                │
│                    ┌───────────▼───────────┐                   │
│                    │   ImageCDN Core       │                   │
│                    │   - Settings Manager  │                   │
│                    │   - URL Builder       │                   │
│                    │   - Cache Helper      │                   │
│                    └───────────┬───────────┘                   │
└────────────────────────────────┼────────────────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │    ImageCDN Edge CDN    │
                    │    (External Service)   │
                    └─────────────────────────┘
```

## Plugin Structure

```
imagecdn-optimizer/
├── imagecdn-optimizer.php      # Main plugin file
├── readme.txt                  # WordPress.org readme
├── uninstall.php              # Cleanup on uninstall
├── languages/                  # Translations
│   └── imagecdn-optimizer.pot
├── includes/
│   ├── class-imagecdn.php           # Main plugin class
│   ├── class-imagecdn-settings.php  # Settings management
│   ├── class-imagecdn-rewriter.php  # URL rewriting logic
│   ├── class-imagecdn-admin.php     # Admin UI
│   ├── class-imagecdn-rest-api.php  # REST API endpoints
│   └── class-imagecdn-gutenberg.php # Gutenberg integration
├── admin/
│   ├── css/
│   │   └── admin.css
│   ├── js/
│   │   └── admin.js
│   └── views/
│       ├── settings-page.php
│       └── partials/
│           ├── tab-general.php
│           ├── tab-advanced.php
│           └── tab-status.php
├── public/
│   └── js/
│       └── lazy-load.js       # Optional lazy loading
└── blocks/
    └── imagecdn-image/
        ├── block.json
        ├── index.js
        └── editor.css
```

## Component Details

### 1. Main Plugin Class (`class-imagecdn.php`)

```php
<?php
/**
 * Main plugin class - Singleton pattern
 */
class ImageCDN {
    private static $instance = null;
    private $settings;
    private $rewriter;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        $this->settings = new ImageCDN_Settings();
        $this->rewriter = new ImageCDN_Rewriter($this->settings);
        
        $this->init_hooks();
    }
    
    private function init_hooks() {
        // Admin hooks
        if (is_admin()) {
            new ImageCDN_Admin($this->settings);
        }
        
        // Frontend URL rewriting
        if (!is_admin() && $this->settings->is_enabled()) {
            $this->rewriter->init();
        }
        
        // REST API
        add_action('rest_api_init', [$this, 'register_rest_routes']);
        
        // Gutenberg blocks
        add_action('init', [$this, 'register_blocks']);
    }
}
```

### 2. Settings Manager (`class-imagecdn-settings.php`)

```php
<?php
/**
 * Manages plugin settings with validation
 */
class ImageCDN_Settings {
    const OPTION_KEY = 'imagecdn_settings';
    
    private $defaults = [
        'enabled'          => false,
        'public_key'       => '',
        'cdn_url'          => 'https://cdn.imagecdn.io',
        'default_quality'  => 80,
        'default_format'   => 'auto',
        'lazy_load'        => true,
        'excluded_paths'   => [],
        'include_srcset'   => true,
        'custom_domain'    => '',
        'auto_webp'        => true,
    ];
    
    public function get($key, $default = null) {
        $settings = get_option(self::OPTION_KEY, $this->defaults);
        return $settings[$key] ?? $default ?? $this->defaults[$key];
    }
    
    public function set($key, $value) {
        $settings = get_option(self::OPTION_KEY, $this->defaults);
        $settings[$key] = $this->sanitize($key, $value);
        update_option(self::OPTION_KEY, $settings);
    }
    
    public function is_enabled() {
        return $this->get('enabled') && !empty($this->get('public_key'));
    }
    
    public function get_cdn_base_url() {
        $custom = $this->get('custom_domain');
        if (!empty($custom)) {
            return 'https://' . $custom;
        }
        return rtrim($this->get('cdn_url'), '/') . '/' . $this->get('public_key');
    }
    
    private function sanitize($key, $value) {
        switch ($key) {
            case 'public_key':
                return sanitize_text_field($value);
            case 'default_quality':
                return max(1, min(100, intval($value)));
            case 'excluded_paths':
                return array_map('sanitize_text_field', (array) $value);
            case 'enabled':
            case 'lazy_load':
            case 'include_srcset':
            case 'auto_webp':
                return (bool) $value;
            default:
                return sanitize_text_field($value);
        }
    }
}
```

### 3. URL Rewriter (`class-imagecdn-rewriter.php`)

```php
<?php
/**
 * Rewrites image URLs to use ImageCDN
 */
class ImageCDN_Rewriter {
    private $settings;
    private $site_url;
    private $upload_url;
    
    public function __construct(ImageCDN_Settings $settings) {
        $this->settings = $settings;
        $this->site_url = site_url();
        $this->upload_url = wp_upload_dir()['baseurl'];
    }
    
    public function init() {
        // Content filters
        add_filter('the_content', [$this, 'rewrite_content'], 999);
        add_filter('post_thumbnail_html', [$this, 'rewrite_html'], 999);
        add_filter('widget_text', [$this, 'rewrite_content'], 999);
        
        // Image source filters
        add_filter('wp_get_attachment_image_src', [$this, 'rewrite_attachment_src'], 999);
        add_filter('wp_get_attachment_url', [$this, 'rewrite_attachment_url'], 999);
        
        // Srcset filters
        if ($this->settings->get('include_srcset')) {
            add_filter('wp_calculate_image_srcset', [$this, 'rewrite_srcset'], 999);
        }
        
        // Theme/plugin image URLs
        add_filter('wp_get_attachment_image_attributes', [$this, 'rewrite_attributes'], 999);
        
        // WooCommerce support
        if (class_exists('WooCommerce')) {
            add_filter('woocommerce_product_get_image', [$this, 'rewrite_html'], 999);
        }
    }
    
    /**
     * Rewrite all image URLs in HTML content
     */
    public function rewrite_content($content) {
        if (empty($content)) {
            return $content;
        }
        
        // Match all img tags
        $pattern = '/<img[^>]+>/i';
        $content = preg_replace_callback($pattern, [$this, 'process_img_tag'], $content);
        
        // Match background images in style attributes
        $pattern = '/style=["\'][^"\']*background(-image)?:\s*url\(["\']?([^"\')\s]+)["\']?\)[^"\']*["\']/i';
        $content = preg_replace_callback($pattern, [$this, 'process_background_url'], $content);
        
        return $content;
    }
    
    /**
     * Process individual img tag
     */
    private function process_img_tag($matches) {
        $img_tag = $matches[0];
        
        // Skip if already processed or excluded
        if (strpos($img_tag, 'data-imagecdn-processed') !== false) {
            return $img_tag;
        }
        
        // Extract src
        if (preg_match('/src=["\']([^"\']+)["\']/i', $img_tag, $src_match)) {
            $original_url = $src_match[1];
            
            if ($this->should_rewrite($original_url)) {
                $cdn_url = $this->build_cdn_url($original_url, $this->extract_dimensions($img_tag));
                $img_tag = str_replace($original_url, $cdn_url, $img_tag);
                $img_tag = str_replace('<img', '<img data-imagecdn-processed="1"', $img_tag);
                
                // Add lazy loading if enabled
                if ($this->settings->get('lazy_load') && strpos($img_tag, 'loading=') === false) {
                    $img_tag = str_replace('<img', '<img loading="lazy"', $img_tag);
                }
            }
        }
        
        // Process srcset
        if (preg_match('/srcset=["\']([^"\']+)["\']/i', $img_tag, $srcset_match)) {
            $original_srcset = $srcset_match[1];
            $new_srcset = $this->rewrite_srcset_string($original_srcset);
            $img_tag = str_replace($original_srcset, $new_srcset, $img_tag);
        }
        
        return $img_tag;
    }
    
    /**
     * Check if URL should be rewritten
     */
    private function should_rewrite($url) {
        // Skip external images
        if (!$this->is_local_url($url)) {
            return false;
        }
        
        // Skip non-image URLs
        if (!$this->is_image_url($url)) {
            return false;
        }
        
        // Skip excluded paths
        foreach ($this->settings->get('excluded_paths') as $path) {
            if (strpos($url, $path) !== false) {
                return false;
            }
        }
        
        // Skip already CDN URLs
        if (strpos($url, $this->settings->get_cdn_base_url()) !== false) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Build CDN URL with transformation parameters
     */
    public function build_cdn_url($original_url, $params = []) {
        $cdn_base = $this->settings->get_cdn_base_url();
        
        // Convert local URL to path
        $path = $this->url_to_path($original_url);
        
        // Build query params
        $query_params = [];
        
        if (!empty($params['width'])) {
            $query_params['w'] = $params['width'];
        }
        if (!empty($params['height'])) {
            $query_params['h'] = $params['height'];
        }
        
        $query_params['q'] = $params['quality'] ?? $this->settings->get('default_quality');
        
        if ($this->settings->get('auto_webp')) {
            $query_params['f'] = 'auto';
        }
        
        $cdn_url = $cdn_base . '/' . ltrim($path, '/');
        
        if (!empty($query_params)) {
            $cdn_url .= '?' . http_build_query($query_params);
        }
        
        return $cdn_url;
    }
    
    /**
     * Convert full URL to relative path
     */
    private function url_to_path($url) {
        // Remove protocol and domain
        $path = str_replace([$this->site_url, $this->upload_url], '', $url);
        
        // Handle wp-content/uploads structure
        if (strpos($path, 'wp-content/uploads') === false && strpos($url, $this->upload_url) !== false) {
            $path = 'wp-content/uploads' . $path;
        }
        
        return ltrim($path, '/');
    }
    
    /**
     * Extract width/height from img tag
     */
    private function extract_dimensions($img_tag) {
        $dimensions = [];
        
        if (preg_match('/width=["\']?(\d+)/i', $img_tag, $match)) {
            $dimensions['width'] = (int) $match[1];
        }
        if (preg_match('/height=["\']?(\d+)/i', $img_tag, $match)) {
            $dimensions['height'] = (int) $match[1];
        }
        
        return $dimensions;
    }
    
    private function is_local_url($url) {
        return strpos($url, $this->site_url) !== false || 
               strpos($url, '/wp-content/') === 0;
    }
    
    private function is_image_url($url) {
        $extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'];
        $path = parse_url($url, PHP_URL_PATH);
        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        return in_array($ext, $extensions);
    }
}
```

### 4. Admin Interface (`class-imagecdn-admin.php`)

```php
<?php
/**
 * Admin settings page
 */
class ImageCDN_Admin {
    private $settings;
    
    public function __construct(ImageCDN_Settings $settings) {
        $this->settings = $settings;
        
        add_action('admin_menu', [$this, 'add_menu_page']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
        add_action('wp_ajax_imagecdn_test_connection', [$this, 'ajax_test_connection']);
        add_action('wp_ajax_imagecdn_clear_cache', [$this, 'ajax_clear_cache']);
    }
    
    public function add_menu_page() {
        add_options_page(
            __('ImageCDN Settings', 'imagecdn-optimizer'),
            __('ImageCDN', 'imagecdn-optimizer'),
            'manage_options',
            'imagecdn-settings',
            [$this, 'render_settings_page']
        );
    }
    
    public function render_settings_page() {
        $active_tab = $_GET['tab'] ?? 'general';
        ?>
        <div class="wrap imagecdn-settings">
            <h1><?php echo esc_html(get_admin_page_title()); ?></h1>
            
            <nav class="nav-tab-wrapper">
                <a href="?page=imagecdn-settings&tab=general" 
                   class="nav-tab <?php echo $active_tab === 'general' ? 'nav-tab-active' : ''; ?>">
                    <?php _e('General', 'imagecdn-optimizer'); ?>
                </a>
                <a href="?page=imagecdn-settings&tab=advanced" 
                   class="nav-tab <?php echo $active_tab === 'advanced' ? 'nav-tab-active' : ''; ?>">
                    <?php _e('Advanced', 'imagecdn-optimizer'); ?>
                </a>
                <a href="?page=imagecdn-settings&tab=status" 
                   class="nav-tab <?php echo $active_tab === 'status' ? 'nav-tab-active' : ''; ?>">
                    <?php _e('Status', 'imagecdn-optimizer'); ?>
                </a>
            </nav>
            
            <form method="post" action="options.php">
                <?php
                settings_fields('imagecdn_settings');
                
                switch ($active_tab) {
                    case 'advanced':
                        include IMAGECDN_PLUGIN_DIR . 'admin/views/partials/tab-advanced.php';
                        break;
                    case 'status':
                        include IMAGECDN_PLUGIN_DIR . 'admin/views/partials/tab-status.php';
                        break;
                    default:
                        include IMAGECDN_PLUGIN_DIR . 'admin/views/partials/tab-general.php';
                }
                
                if ($active_tab !== 'status') {
                    submit_button();
                }
                ?>
            </form>
        </div>
        <?php
    }
    
    public function ajax_test_connection() {
        check_ajax_referer('imagecdn_admin', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => 'Unauthorized']);
        }
        
        $public_key = $this->settings->get('public_key');
        
        if (empty($public_key)) {
            wp_send_json_error(['message' => 'API key not configured']);
        }
        
        // Test by requesting a small image transformation
        $test_url = $this->settings->get_cdn_base_url() . '/test.jpg?w=1&q=1';
        $response = wp_remote_head($test_url, ['timeout' => 10]);
        
        if (is_wp_error($response)) {
            wp_send_json_error(['message' => $response->get_error_message()]);
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        
        if ($status_code === 200 || $status_code === 404) {
            // 404 is OK - means CDN is responding, just no test image
            wp_send_json_success(['message' => 'Connection successful']);
        } else {
            wp_send_json_error([
                'message' => 'CDN returned status ' . $status_code
            ]);
        }
    }
}
```

### 5. Gutenberg Block

```json
// blocks/imagecdn-image/block.json
{
  "$schema": "https://schemas.wp.org/trunk/block.json",
  "apiVersion": 3,
  "name": "imagecdn/optimized-image",
  "title": "ImageCDN Image",
  "category": "media",
  "icon": "format-image",
  "description": "Add an optimized image via ImageCDN",
  "keywords": ["image", "cdn", "optimize"],
  "textdomain": "imagecdn-optimizer",
  "attributes": {
    "id": { "type": "number" },
    "url": { "type": "string" },
    "alt": { "type": "string" },
    "width": { "type": "number" },
    "height": { "type": "number" },
    "quality": { "type": "number", "default": 80 },
    "format": { "type": "string", "default": "auto" }
  },
  "supports": {
    "align": true,
    "html": false
  },
  "editorScript": "file:./index.js",
  "editorStyle": "file:./editor.css"
}
```

## Data Flow

### Image Request Flow

```
1. Page Load
   │
   ├─► WordPress renders content
   │
   ├─► ImageCDN plugin filters output
   │   └─► Rewrites /wp-content/uploads/image.jpg
   │       to https://cdn.imagecdn.io/{pk}/wp-content/uploads/image.jpg?w=800&q=80&f=auto
   │
   ├─► Browser requests image from CDN
   │
   └─► CDN edge serves optimized image
       ├─► Cache HIT: Return cached version
       └─► Cache MISS: 
           ├─► Fetch from WordPress origin
           ├─► Transform (resize, compress, convert)
           ├─► Cache result
           └─► Return to browser
```

### Settings Save Flow

```
1. Admin saves settings
   │
   ├─► WordPress sanitizes input
   │
   ├─► Plugin validates API key format
   │
   ├─► Optional: Test CDN connection
   │
   ├─► Save to wp_options table
   │
   └─► Clear any cached rewrites
```

## WordPress Hooks Used

### Filters for URL Rewriting

| Hook | Priority | Purpose |
|------|----------|---------|
| `the_content` | 999 | Main content images |
| `post_thumbnail_html` | 999 | Featured images |
| `wp_get_attachment_image_src` | 999 | Programmatic image URLs |
| `wp_get_attachment_url` | 999 | Attachment URLs |
| `wp_calculate_image_srcset` | 999 | Responsive images |
| `widget_text` | 999 | Widget content |

### Admin Hooks

| Hook | Purpose |
|------|---------|
| `admin_menu` | Add settings page |
| `admin_init` | Register settings |
| `admin_enqueue_scripts` | Load admin assets |
| `plugin_action_links` | Add settings link |

## Database Schema

The plugin stores all settings in a single option:

```php
// wp_options table
option_name: 'imagecdn_settings'
option_value: {
    "enabled": true,
    "public_key": "imgcdn_pk_xxxxx",
    "cdn_url": "https://cdn.imagecdn.io",
    "default_quality": 80,
    "default_format": "auto",
    "lazy_load": true,
    "excluded_paths": ["/wp-content/uploads/woocommerce_uploads/"],
    "include_srcset": true,
    "custom_domain": "",
    "auto_webp": true
}
```

## Security Considerations

1. **Input Sanitization**: All settings sanitized before save
2. **Nonce Verification**: All AJAX requests verified
3. **Capability Checks**: Only `manage_options` users can configure
4. **Escaped Output**: All output properly escaped
5. **No Direct File Access**: Files check for `ABSPATH`

## Performance Optimizations

1. **Lazy Initialization**: Rewriter only loads on frontend
2. **Regex Caching**: Compiled patterns cached
3. **Early Bail-Out**: Skip processing if disabled
4. **Minimal DB Queries**: Single option load per request
5. **Object Caching Support**: Settings cached in memory

## Compatibility

### Tested With
- WordPress 5.9+
- PHP 7.4+
- WooCommerce 7.0+
- Elementor
- Divi
- Gutenberg
- Classic Editor

### Known Integrations
- WooCommerce product images
- ACF image fields
- Elementor image widgets
- Divi image modules

## Testing Checklist

- [ ] Plugin activation/deactivation
- [ ] Settings save/load
- [ ] CDN connection test
- [ ] Image URL rewriting in content
- [ ] Featured image rewriting
- [ ] Srcset rewriting
- [ ] WooCommerce product images
- [ ] Lazy loading functionality
- [ ] Excluded paths working
- [ ] Custom domain support
- [ ] Gutenberg block
- [ ] Multisite compatibility
