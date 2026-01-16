# WordPress Plugin Specification

> **Production-grade WordPress plugin for ImageCDN**
> 
> This plugin is a thin client and acquisition channel.
> All image processing happens on the SaaS backend and CDN.
> The plugin's job is: **configuration, URL rewriting, and WordPress integration**.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [File Structure](#file-structure)
3. [Class Architecture](#class-architecture)
4. [Settings UI Specification](#settings-ui-specification)
5. [URL Rewriting System](#url-rewriting-system)
6. [Srcset Algorithm](#srcset-algorithm)
7. [Hook Mapping](#hook-mapping)
8. [Security Implementation](#security-implementation)
9. [WooCommerce Integration](#woocommerce-integration)
10. [Compatibility Matrix](#compatibility-matrix)
11. [Performance Optimization](#performance-optimization)
12. [Manual QA Checklist](#manual-qa-checklist)

---

## Architecture Overview

### Design Principles

| Principle | Implementation |
|-----------|----------------|
| **Thin client** | No image processing in PHP |
| **Non-destructive** | Never modify database URLs |
| **Reversible** | One toggle to disable |
| **Cache-friendly** | Deterministic URLs |
| **Fail-safe** | Graceful degradation |

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        WordPress Request                         │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ImageCDN Plugin                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │  Settings   │  │  Rewriter   │  │  Srcset Generator       │  │
│  │  Manager    │  │  Engine     │  │                         │  │
│  └─────────────┘  └──────┬──────┘  └─────────────────────────┘  │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              Rewritten HTML with CDN URLs                        │
│  <img src="https://cdn.imagecdn.io/pk_xxx/path?w=800&q=80&f=auto" │
│       srcset="...320w, ...640w, ...1024w"                        │
│       sizes="(max-width: 800px) 100vw, 800px">                   │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ImageCDN Edge (CDN)                           │
│              Transform → Cache → Deliver                         │
└─────────────────────────────────────────────────────────────────┘
```

### URL Structure

```
# Standard URL (all plans)
https://cdn.imagecdn.io/{public_key}/{path}?w={width}&h={height}&q={quality}&f={format}

# Signed URL (Pro/Enterprise)
https://cdn.imagecdn.io/{public_key}/{path}?w=800&q=80&f=auto&exp={timestamp}&sig={signature}

# Preset URL (Enterprise)
https://cdn.imagecdn.io/{public_key}/preset:{preset_name}/{path}
```

---

## File Structure

```
imagecdn-optimizer/
├── imagecdn-optimizer.php          # Main plugin file
├── uninstall.php                   # Cleanup on deletion
├── readme.txt                      # WordPress.org readme
│
├── includes/
│   ├── class-imagecdn.php          # Main plugin class (singleton)
│   ├── class-imagecdn-settings.php # Settings management
│   ├── class-imagecdn-rewriter.php # URL rewriting engine
│   ├── class-imagecdn-srcset.php   # Srcset generation
│   ├── class-imagecdn-admin.php    # Admin UI
│   ├── class-imagecdn-api.php      # SaaS API client
│   ├── class-imagecdn-signer.php   # URL signing (HMAC)
│   ├── class-imagecdn-detector.php # Compatibility detection
│   └── class-imagecdn-woocommerce.php # WooCommerce integration
│
├── admin/
│   ├── css/
│   │   └── admin.css               # Admin styles
│   ├── js/
│   │   └── admin.js                # Admin scripts
│   └── views/
│       ├── settings-page.php       # Main settings template
│       ├── settings-general.php    # General tab
│       ├── settings-advanced.php   # Advanced tab
│       └── settings-status.php     # Status/diagnostics tab
│
├── blocks/
│   └── imagecdn-image/
│       ├── block.json              # Block metadata
│       ├── index.js                # Block editor script
│       ├── editor.css              # Editor styles
│       └── style.css               # Frontend styles
│
├── languages/
│   └── imagecdn-optimizer.pot      # Translation template
│
└── tests/
    ├── bootstrap.php
    ├── test-settings.php
    ├── test-rewriter.php
    └── test-srcset.php
```

---

## Class Architecture

### Class Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        ImageCDN (Singleton)                      │
│  - Main plugin orchestrator                                      │
│  - Initializes all components                                    │
│  - Manages lifecycle hooks                                       │
└─────────────────────────────┬───────────────────────────────────┘
                              │ has
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ ImageCDN_Settings│  │ ImageCDN_Rewriter│ │ ImageCDN_Admin  │
│ - get/set options│  │ - URL rewriting  │  │ - Settings UI   │
│ - validation     │  │ - Filter hooks   │  │ - AJAX handlers │
│ - defaults       │  │ - Exclusions     │  │ - Diagnostics   │
└─────────────────┘  └────────┬─────────┘  └─────────────────┘
                              │ uses
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ ImageCDN_Srcset │  │ ImageCDN_Signer │  │ ImageCDN_API    │
│ - Size mapping  │  │ - HMAC signing  │  │ - Connection test│
│ - Srcset build  │  │ - Expiry calc   │  │ - Config fetch  │
│ - Sizes attr    │  │ - Verification  │  │ - Error handling│
└─────────────────┘  └─────────────────┘  └─────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ImageCDN_WooCommerce│
                    │ - Product images │
                    │ - Gallery hooks  │
                    │ - Zoom support   │
                    └─────────────────┘
```

### Class Specifications

#### ImageCDN (Main Class)

```php
<?php
/**
 * Main plugin class - Singleton pattern
 */
class ImageCDN {
    private static $instance = null;
    
    private ImageCDN_Settings $settings;
    private ImageCDN_Rewriter $rewriter;
    private ImageCDN_Admin $admin;
    private ImageCDN_API $api;
    private ImageCDN_Signer $signer;
    private ImageCDN_Srcset $srcset;
    private ?ImageCDN_WooCommerce $woocommerce = null;
    
    public static function get_instance(): self;
    private function __construct();
    
    // Lifecycle
    public function init(): void;
    public function load_textdomain(): void;
    
    // Accessors
    public function get_settings(): ImageCDN_Settings;
    public function get_rewriter(): ImageCDN_Rewriter;
    public function get_api(): ImageCDN_API;
    public function get_signer(): ImageCDN_Signer;
    
    // Conditionals
    public function is_enabled(): bool;
    public function should_rewrite(): bool;
}
```

#### ImageCDN_Settings

```php
<?php
/**
 * Settings management with validation and defaults
 */
class ImageCDN_Settings {
    const OPTION_KEY = 'imagecdn_settings';
    const OPTION_GROUP = 'imagecdn_settings_group';
    
    private array $defaults = [
        'enabled'           => false,
        'public_key'        => '',
        'secret_key'        => '',
        'cdn_url'           => 'https://cdn.imagecdn.io',
        'mode'              => 'media_only', // media_only | all_images
        'default_quality'   => 80,
        'default_format'    => 'auto',
        'enable_signed_urls'=> false,
        'enable_lazy_load'  => true,
        'enable_srcset'     => true,
        'excluded_paths'    => [],
        'preset_content'    => '',
        'preset_featured'   => '',
        'preset_woocommerce'=> '',
    ];
    
    // Core methods
    public function get(string $key, $default = null);
    public function get_all(): array;
    public function set(string $key, $value): bool;
    public function save(array $settings): bool;
    
    // Validation
    public function validate(array $input): array;
    public function sanitize_public_key(string $key): string;
    public function sanitize_secret_key(string $key): string;
    
    // Helpers
    public function is_enabled(): bool;
    public function is_configured(): bool;
    public function get_cdn_base_url(): string;
    public function supports_signed_urls(): bool;
}
```

#### ImageCDN_Rewriter

```php
<?php
/**
 * URL rewriting engine - Core feature
 */
class ImageCDN_Rewriter {
    private ImageCDN_Settings $settings;
    private ImageCDN_Srcset $srcset;
    private ImageCDN_Signer $signer;
    
    // Initialization
    public function init(): void;
    public function register_hooks(): void;
    
    // Filter callbacks
    public function filter_attachment_image_src(
        array $image, 
        int $attachment_id, 
        string|array $size
    ): array;
    
    public function filter_attachment_image_attributes(
        array $attr, 
        WP_Post $attachment, 
        string|array $size
    ): array;
    
    public function filter_the_content(string $content): string;
    public function filter_post_thumbnail_html(string $html): string;
    public function filter_srcset(array $sources, array $size_array): array;
    public function filter_sizes(string $sizes, array $size): string;
    
    // Core rewriting
    public function rewrite_url(string $url, array $params = []): string;
    public function build_cdn_url(string $original_url, array $params): string;
    
    // HTML processing
    public function process_img_tag(string $img_html): string;
    public function process_content_images(string $content): string;
    
    // Exclusion logic
    public function should_rewrite_url(string $url): bool;
    public function is_local_url(string $url): bool;
    public function is_excluded_path(string $path): bool;
    public function is_data_uri(string $url): bool;
    public function is_external_url(string $url): bool;
    
    // Context checks
    public function should_process(): bool;
    public function is_admin_context(): bool;
    public function is_rest_request(): bool;
    public function is_feed(): bool;
}
```

#### ImageCDN_Srcset

```php
<?php
/**
 * Responsive image srcset generation
 */
class ImageCDN_Srcset {
    // Standard responsive widths (optimized for common breakpoints)
    const SRCSET_WIDTHS = [320, 480, 640, 768, 1024, 1280, 1536, 1920];
    
    // Maximum srcset entries to prevent HTML bloat
    const MAX_SRCSET_ENTRIES = 6;
    
    private ImageCDN_Settings $settings;
    
    /**
     * Generate srcset URLs for an image
     */
    public function generate_srcset(
        string $original_url,
        int $original_width,
        array $params = []
    ): array;
    
    /**
     * Calculate optimal widths based on original image
     */
    public function calculate_widths(int $original_width): array;
    
    /**
     * Generate sizes attribute based on context
     */
    public function generate_sizes(
        int $width,
        string $context = 'content'
    ): string;
    
    /**
     * Map WordPress size to width
     */
    public function get_size_width(string|array $size): int;
    
    /**
     * Filter existing srcset to use CDN URLs
     */
    public function filter_srcset_sources(
        array $sources,
        array $size_array,
        string $image_src,
        array $image_meta,
        int $attachment_id
    ): array;
}
```

#### ImageCDN_Signer

```php
<?php
/**
 * URL signing for secure image access
 */
class ImageCDN_Signer {
    const DEFAULT_EXPIRY = 3600;      // 1 hour
    const MAX_EXPIRY = 86400;         // 24 hours
    const ALGORITHM = 'sha256';
    
    private string $secret_key;
    
    /**
     * Generate signed URL
     */
    public function sign_url(
        string $url,
        int $expiry_seconds = self::DEFAULT_EXPIRY
    ): string;
    
    /**
     * Generate signature for URL
     */
    public function generate_signature(
        string $string_to_sign
    ): string;
    
    /**
     * Build string to sign from URL components
     */
    public function build_signing_string(
        string $path,
        array $params,
        int $expiry
    ): string;
    
    /**
     * Verify signature (for debugging)
     */
    public function verify_signature(
        string $url,
        string $signature
    ): bool;
}
```

#### ImageCDN_API

```php
<?php
/**
 * SaaS API client for configuration and validation
 */
class ImageCDN_API {
    const API_BASE = 'https://api.imagecdn.io/v1';
    const TIMEOUT = 10;
    
    private ImageCDN_Settings $settings;
    
    /**
     * Test connection to SaaS
     */
    public function test_connection(): array; // [success, message, data]
    
    /**
     * Validate API key
     */
    public function validate_key(string $public_key): array;
    
    /**
     * Fetch tenant configuration
     */
    public function get_tenant_config(): ?array;
    
    /**
     * Check domain authorization
     */
    public function check_domain(string $domain): bool;
    
    /**
     * Get plan features
     */
    public function get_plan_features(): array;
    
    /**
     * Get usage statistics
     */
    public function get_usage_stats(): array;
    
    /**
     * Handle API errors
     */
    private function handle_error(WP_Error|array $response): array;
}
```

---

## Settings UI Specification

### Settings Page Structure

```
ImageCDN Settings
├── General Tab
│   ├── Enable ImageCDN [toggle]
│   ├── API Public Key [text, required]
│   ├── API Secret Key [password, optional]
│   ├── [Test Connection] button
│   └── Connection Status [display]
│
├── Optimization Tab
│   ├── Mode [select]
│   │   ├── Media Library Only
│   │   └── All Frontend Images
│   ├── Default Quality [range 1-100]
│   ├── Auto Format [toggle] (WebP/AVIF)
│   ├── Lazy Loading [toggle]
│   └── Responsive Images [toggle]
│
├── Advanced Tab
│   ├── CDN URL [text, default provided]
│   ├── Enable Signed URLs [toggle, plan-dependent]
│   ├── Excluded Paths [textarea]
│   ├── Presets
│   │   ├── Content Images [text]
│   │   ├── Featured Images [text]
│   │   └── WooCommerce [text]
│   └── Custom Domain [text, Pro+]
│
└── Status Tab
    ├── Connection Status [display]
    ├── Plan Information [display]
    ├── Usage Statistics [display]
    ├── Allowed Domains [display]
    ├── Sample URL Preview [display]
    └── System Information [display]
```

### Field Specifications

| Field | Type | Validation | Default |
|-------|------|------------|---------|
| `enabled` | checkbox | boolean | `false` |
| `public_key` | text | `imgcdn_pk_[a-zA-Z0-9]{8,64}` | `''` |
| `secret_key` | password | `imgcdn_sk_[a-zA-Z0-9]{16,64}` | `''` |
| `cdn_url` | url | valid URL, https | `https://cdn.imagecdn.io` |
| `mode` | select | enum | `media_only` |
| `default_quality` | range | 1-100, integer | `80` |
| `default_format` | select | auto\|webp\|avif\|jpeg\|png | `auto` |
| `enable_signed_urls` | checkbox | boolean, plan check | `false` |
| `enable_lazy_load` | checkbox | boolean | `true` |
| `enable_srcset` | checkbox | boolean | `true` |
| `excluded_paths` | textarea | paths, one per line | `[]` |

### Admin UI Implementation

```php
<?php
/**
 * Admin settings page implementation
 */
class ImageCDN_Admin {
    public function __construct(ImageCDN_Settings $settings);
    
    // WordPress hooks
    public function register_hooks(): void {
        add_action('admin_menu', [$this, 'add_menu_page']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_assets']);
        
        // AJAX handlers
        add_action('wp_ajax_imagecdn_test_connection', [$this, 'ajax_test_connection']);
        add_action('wp_ajax_imagecdn_get_stats', [$this, 'ajax_get_stats']);
        add_action('wp_ajax_imagecdn_clear_cache', [$this, 'ajax_clear_cache']);
    }
    
    // Menu registration
    public function add_menu_page(): void {
        add_options_page(
            __('ImageCDN Settings', 'imagecdn-optimizer'),
            __('ImageCDN', 'imagecdn-optimizer'),
            'manage_options',
            'imagecdn-settings',
            [$this, 'render_settings_page']
        );
    }
    
    // Settings registration
    public function register_settings(): void {
        register_setting(
            ImageCDN_Settings::OPTION_GROUP,
            ImageCDN_Settings::OPTION_KEY,
            [
                'type' => 'array',
                'sanitize_callback' => [$this->settings, 'validate'],
            ]
        );
        
        // General section
        add_settings_section(
            'imagecdn_general',
            __('General Settings', 'imagecdn-optimizer'),
            [$this, 'render_section_general'],
            'imagecdn-settings'
        );
        
        // Add fields...
    }
    
    // AJAX: Test connection
    public function ajax_test_connection(): void {
        check_ajax_referer('imagecdn_admin', 'nonce');
        
        if (!current_user_can('manage_options')) {
            wp_send_json_error(['message' => __('Unauthorized', 'imagecdn-optimizer')]);
        }
        
        $api = new ImageCDN_API($this->settings);
        $result = $api->test_connection();
        
        if ($result['success']) {
            wp_send_json_success($result);
        } else {
            wp_send_json_error($result);
        }
    }
}
```

### JavaScript for Admin

```javascript
/**
 * Admin settings page JavaScript
 */
(function($) {
    'use strict';
    
    const ImageCDNAdmin = {
        init() {
            this.bindEvents();
            this.initQualitySlider();
            this.checkPlanFeatures();
        },
        
        bindEvents() {
            $('#imagecdn-test-connection').on('click', this.testConnection.bind(this));
            $('#imagecdn_public_key').on('blur', this.validateApiKey.bind(this));
            $('#imagecdn_enable_signed_urls').on('change', this.checkSignedUrlsSupport.bind(this));
        },
        
        testConnection(e) {
            e.preventDefault();
            
            const $button = $(e.target);
            const $result = $('#imagecdn-test-result');
            
            $button.prop('disabled', true);
            $result.html('<span class="spinner is-active"></span> Testing...');
            
            $.ajax({
                url: imagecdnAdmin.ajaxUrl,
                type: 'POST',
                data: {
                    action: 'imagecdn_test_connection',
                    nonce: imagecdnAdmin.nonce,
                },
                success(response) {
                    if (response.success) {
                        $result.html('<span class="dashicons dashicons-yes-alt"></span> ' + response.data.message)
                               .addClass('success').removeClass('error');
                        
                        // Update plan info display
                        if (response.data.plan) {
                            ImageCDNAdmin.updatePlanDisplay(response.data.plan);
                        }
                    } else {
                        $result.html('<span class="dashicons dashicons-warning"></span> ' + response.data.message)
                               .addClass('error').removeClass('success');
                    }
                },
                error() {
                    $result.html('<span class="dashicons dashicons-warning"></span> Connection failed')
                           .addClass('error');
                },
                complete() {
                    $button.prop('disabled', false);
                }
            });
        },
        
        validateApiKey(e) {
            const value = $(e.target).val().trim();
            const pattern = /^imgcdn_pk_[a-zA-Z0-9]{8,64}$/;
            
            if (value && !pattern.test(value)) {
                $(e.target).addClass('error');
                this.showFieldError(e.target, 'Invalid API key format');
            } else {
                $(e.target).removeClass('error');
            }
        },
        
        checkSignedUrlsSupport(e) {
            const $checkbox = $(e.target);
            
            if ($checkbox.is(':checked') && !imagecdnAdmin.planSupportsSignedUrls) {
                $checkbox.prop('checked', false);
                alert('Your current plan does not support signed URLs. Please upgrade.');
            }
        },
        
        updatePlanDisplay(plan) {
            $('#imagecdn-plan-name').text(plan.name);
            $('#imagecdn-plan-tier').text(plan.tier);
            
            // Update feature availability
            if (plan.features.signedUrls) {
                $('#imagecdn_enable_signed_urls').prop('disabled', false);
                imagecdnAdmin.planSupportsSignedUrls = true;
            }
        }
    };
    
    $(document).ready(() => ImageCDNAdmin.init());
    
})(jQuery);
```

---

## URL Rewriting System

### Hook Priority Map

```php
<?php
/**
 * Hook registration with priorities
 * Lower = earlier execution
 */
class ImageCDN_Rewriter {
    public function register_hooks(): void {
        // Skip if not enabled or in admin
        if (!$this->should_process()) {
            return;
        }
        
        // === Attachment Filters (High Priority) ===
        // These run early to catch URLs before other plugins
        add_filter('wp_get_attachment_image_src', [$this, 'filter_attachment_src'], 10, 4);
        add_filter('wp_get_attachment_url', [$this, 'filter_attachment_url'], 10, 2);
        add_filter('wp_get_attachment_image_attributes', [$this, 'filter_image_attributes'], 10, 3);
        
        // === Srcset Filters ===
        add_filter('wp_calculate_image_srcset', [$this, 'filter_srcset'], 10, 5);
        add_filter('wp_calculate_image_sizes', [$this, 'filter_sizes'], 10, 5);
        
        // === Content Filters (Late Priority) ===
        // Run late to catch all images including those added by shortcodes
        add_filter('the_content', [$this, 'filter_content'], 999);
        add_filter('post_thumbnail_html', [$this, 'filter_thumbnail'], 999);
        add_filter('get_avatar', [$this, 'filter_avatar'], 999);
        
        // === Widget Filters ===
        add_filter('widget_text', [$this, 'filter_content'], 999);
        add_filter('widget_text_content', [$this, 'filter_content'], 999);
        
        // === Excerpt ===
        add_filter('the_excerpt', [$this, 'filter_content'], 999);
        
        // === Optional: Full HTML Output Buffer ===
        // Only if mode is 'all_images'
        if ($this->settings->get('mode') === 'all_images') {
            add_action('template_redirect', [$this, 'start_output_buffer'], 1);
        }
    }
}
```

### URL Rewriting Logic

```php
<?php
/**
 * Core URL rewriting implementation
 */
class ImageCDN_Rewriter {
    /**
     * Build CDN URL from original WordPress URL
     */
    public function build_cdn_url(string $original_url, array $params = []): string {
        // Validate URL should be rewritten
        if (!$this->should_rewrite_url($original_url)) {
            return $original_url;
        }
        
        // Get CDN base URL
        $cdn_base = $this->settings->get_cdn_base_url();
        
        // Extract path from original URL
        $path = $this->url_to_path($original_url);
        
        // Build transform parameters
        $transform_params = $this->build_transform_params($params);
        
        // Build URL
        $cdn_url = $cdn_base . '/' . ltrim($path, '/');
        
        if (!empty($transform_params)) {
            $cdn_url .= '?' . http_build_query($transform_params);
        }
        
        // Add signature if enabled
        if ($this->settings->get('enable_signed_urls') && $this->signer) {
            $cdn_url = $this->signer->sign_url($cdn_url);
        }
        
        return $cdn_url;
    }
    
    /**
     * Build transform parameters from input
     */
    private function build_transform_params(array $params): array {
        $transform = [];
        
        // Width
        if (!empty($params['width'])) {
            $transform['w'] = (int) $params['width'];
        }
        
        // Height
        if (!empty($params['height'])) {
            $transform['h'] = (int) $params['height'];
        }
        
        // Quality (use default if not specified)
        $transform['q'] = $params['quality'] ?? $this->settings->get('default_quality');
        
        // Format
        if ($this->settings->get('default_format') === 'auto') {
            $transform['f'] = 'auto';
        }
        
        // Fit mode
        if (!empty($params['fit'])) {
            $transform['fit'] = $params['fit'];
        }
        
        return $transform;
    }
    
    /**
     * Convert WordPress URL to relative path
     */
    private function url_to_path(string $url): string {
        $site_url = site_url();
        $upload_dir = wp_upload_dir();
        
        // Remove site URL prefix
        if (strpos($url, $site_url) === 0) {
            return substr($url, strlen($site_url));
        }
        
        // Remove upload base URL prefix
        if (strpos($url, $upload_dir['baseurl']) === 0) {
            return '/wp-content/uploads' . substr($url, strlen($upload_dir['baseurl']));
        }
        
        // Parse URL and return path
        $parsed = parse_url($url);
        return $parsed['path'] ?? $url;
    }
    
    /**
     * Check if URL should be rewritten
     */
    public function should_rewrite_url(string $url): bool {
        // Skip empty URLs
        if (empty($url)) {
            return false;
        }
        
        // Skip data URIs
        if (strpos($url, 'data:') === 0) {
            return false;
        }
        
        // Skip already-rewritten URLs
        if (strpos($url, $this->settings->get('cdn_url')) !== false) {
            return false;
        }
        
        // Skip external URLs (unless explicitly allowed)
        if (!$this->is_local_url($url)) {
            return false;
        }
        
        // Skip excluded paths
        if ($this->is_excluded_path($url)) {
            return false;
        }
        
        // Skip non-image extensions
        if (!$this->is_image_url($url)) {
            return false;
        }
        
        return true;
    }
    
    /**
     * Check if URL is a local image
     */
    private function is_local_url(string $url): bool {
        $site_host = parse_url(site_url(), PHP_URL_HOST);
        $url_host = parse_url($url, PHP_URL_HOST);
        
        // Relative URLs are local
        if (empty($url_host)) {
            return true;
        }
        
        return $url_host === $site_host;
    }
    
    /**
     * Check if URL is an image
     */
    private function is_image_url(string $url): bool {
        $path = parse_url($url, PHP_URL_PATH);
        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        
        return in_array($extension, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'], true);
    }
}
```

### Content Filter Implementation

```php
<?php
/**
 * Process images in post content
 */
public function filter_content(string $content): string {
    if (empty($content)) {
        return $content;
    }
    
    // Find all img tags
    $pattern = '/<img\s+[^>]*src=["\']([^"\']+)["\'][^>]*>/i';
    
    return preg_replace_callback($pattern, function($matches) {
        $img_tag = $matches[0];
        $src = $matches[1];
        
        // Skip if shouldn't rewrite
        if (!$this->should_rewrite_url($src)) {
            return $img_tag;
        }
        
        // Extract existing attributes
        $attrs = $this->parse_img_attributes($img_tag);
        
        // Build CDN URL with dimensions if available
        $params = [];
        if (!empty($attrs['width'])) {
            $params['width'] = $attrs['width'];
        }
        if (!empty($attrs['height'])) {
            $params['height'] = $attrs['height'];
        }
        
        $cdn_url = $this->build_cdn_url($src, $params);
        
        // Replace src
        $img_tag = str_replace($src, $cdn_url, $img_tag);
        
        // Add lazy loading if enabled and not already present
        if ($this->settings->get('enable_lazy_load') && 
            strpos($img_tag, 'loading=') === false) {
            $img_tag = str_replace('<img ', '<img loading="lazy" ', $img_tag);
        }
        
        return $img_tag;
    }, $content);
}

/**
 * Parse attributes from img tag
 */
private function parse_img_attributes(string $img_tag): array {
    $attrs = [];
    
    // Width
    if (preg_match('/width=["\']?(\d+)["\']?/i', $img_tag, $m)) {
        $attrs['width'] = (int) $m[1];
    }
    
    // Height
    if (preg_match('/height=["\']?(\d+)["\']?/i', $img_tag, $m)) {
        $attrs['height'] = (int) $m[1];
    }
    
    // Alt
    if (preg_match('/alt=["\']([^"\']*)["\']/', $img_tag, $m)) {
        $attrs['alt'] = $m[1];
    }
    
    // Class
    if (preg_match('/class=["\']([^"\']*)["\']/', $img_tag, $m)) {
        $attrs['class'] = $m[1];
    }
    
    return $attrs;
}
```

---

## Srcset Algorithm

### Width Calculation

```php
<?php
/**
 * Calculate optimal srcset widths based on original image
 */
class ImageCDN_Srcset {
    const SRCSET_WIDTHS = [320, 480, 640, 768, 1024, 1280, 1536, 1920];
    const MAX_SRCSET_ENTRIES = 6;
    
    /**
     * Generate srcset string for an image
     */
    public function generate_srcset(
        string $original_url,
        int $original_width,
        array $params = []
    ): string {
        $widths = $this->calculate_widths($original_width);
        $srcset_parts = [];
        
        foreach ($widths as $width) {
            $url_params = array_merge($params, ['width' => $width]);
            $cdn_url = $this->rewriter->build_cdn_url($original_url, $url_params);
            $srcset_parts[] = $cdn_url . ' ' . $width . 'w';
        }
        
        return implode(', ', $srcset_parts);
    }
    
    /**
     * Calculate widths to include in srcset
     */
    public function calculate_widths(int $original_width): array {
        // Filter standard widths to those <= original width
        $widths = array_filter(self::SRCSET_WIDTHS, function($w) use ($original_width) {
            return $w <= $original_width;
        });
        
        // Always include original width if not too large
        if ($original_width <= 2400 && !in_array($original_width, $widths)) {
            $widths[] = $original_width;
        }
        
        // Sort ascending
        sort($widths);
        
        // Limit entries to prevent HTML bloat
        if (count($widths) > self::MAX_SRCSET_ENTRIES) {
            // Keep evenly distributed widths
            $widths = $this->reduce_widths($widths, self::MAX_SRCSET_ENTRIES);
        }
        
        return $widths;
    }
    
    /**
     * Reduce widths array to target count while maintaining distribution
     */
    private function reduce_widths(array $widths, int $target): array {
        $count = count($widths);
        $step = ($count - 1) / ($target - 1);
        $result = [];
        
        for ($i = 0; $i < $target; $i++) {
            $index = (int) round($i * $step);
            $result[] = $widths[$index];
        }
        
        return array_unique($result);
    }
    
    /**
     * Generate sizes attribute based on context
     */
    public function generate_sizes(int $width, string $context = 'content'): string {
        switch ($context) {
            case 'full_width':
                return '100vw';
                
            case 'featured':
                return '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 800px';
                
            case 'thumbnail':
                return '(max-width: 320px) 100vw, 320px';
                
            case 'content':
            default:
                if ($width <= 640) {
                    return '(max-width: ' . $width . 'px) 100vw, ' . $width . 'px';
                }
                return '(max-width: 640px) 100vw, (max-width: 1024px) 80vw, ' . min($width, 800) . 'px';
        }
    }
    
    /**
     * Filter WordPress srcset to use CDN URLs
     */
    public function filter_srcset_sources(
        array $sources,
        array $size_array,
        string $image_src,
        array $image_meta,
        int $attachment_id
    ): array {
        foreach ($sources as $width => &$source) {
            if ($this->rewriter->should_rewrite_url($source['url'])) {
                $source['url'] = $this->rewriter->build_cdn_url(
                    $source['url'],
                    ['width' => $width]
                );
            }
        }
        
        return $sources;
    }
}
```

### Srcset Output Example

```html
<!-- Original WordPress output -->
<img src="photo.jpg" 
     srcset="photo-300x200.jpg 300w, photo-768x512.jpg 768w, photo-1024x683.jpg 1024w"
     sizes="(max-width: 1024px) 100vw, 1024px">

<!-- After ImageCDN rewriting -->
<img src="https://cdn.imagecdn.io/pk_xxx/wp-content/uploads/photo.jpg?w=1024&q=80&f=auto" 
     srcset="https://cdn.imagecdn.io/pk_xxx/wp-content/uploads/photo.jpg?w=320&q=80&f=auto 320w,
             https://cdn.imagecdn.io/pk_xxx/wp-content/uploads/photo.jpg?w=640&q=80&f=auto 640w,
             https://cdn.imagecdn.io/pk_xxx/wp-content/uploads/photo.jpg?w=768&q=80&f=auto 768w,
             https://cdn.imagecdn.io/pk_xxx/wp-content/uploads/photo.jpg?w=1024&q=80&f=auto 1024w"
     sizes="(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 800px"
     loading="lazy">
```

---

## Security Implementation

### URL Signing

```php
<?php
/**
 * HMAC-SHA256 URL signing implementation
 */
class ImageCDN_Signer {
    private string $secret_key;
    
    const DEFAULT_EXPIRY = 3600;  // 1 hour
    const ALGORITHM = 'sha256';
    
    public function __construct(string $secret_key) {
        $this->secret_key = $secret_key;
    }
    
    /**
     * Sign a URL with expiry and HMAC signature
     */
    public function sign_url(string $url, int $expiry_seconds = self::DEFAULT_EXPIRY): string {
        $parsed = parse_url($url);
        $path = $parsed['path'];
        
        // Parse existing query params
        $params = [];
        if (!empty($parsed['query'])) {
            parse_str($parsed['query'], $params);
        }
        
        // Add expiry timestamp
        $expiry = time() + $expiry_seconds;
        $params['exp'] = $expiry;
        
        // Sort params for consistent signing
        ksort($params);
        
        // Build string to sign
        $query_string = http_build_query($params);
        $string_to_sign = $path . '?' . $query_string;
        
        // Generate signature
        $signature = $this->generate_signature($string_to_sign);
        
        // Add signature to params
        $params['sig'] = $signature;
        
        // Build final URL
        $scheme = $parsed['scheme'] ?? 'https';
        $host = $parsed['host'];
        
        return $scheme . '://' . $host . $path . '?' . http_build_query($params);
    }
    
    /**
     * Generate HMAC signature
     */
    public function generate_signature(string $string_to_sign): string {
        $hash = hash_hmac(self::ALGORITHM, $string_to_sign, $this->secret_key, true);
        
        // URL-safe base64
        return rtrim(strtr(base64_encode($hash), '+/', '-_'), '=');
    }
}
```

### Security Checklist

```php
<?php
/**
 * Security measures implemented in the plugin
 */

// 1. Nonce verification for all AJAX actions
public function ajax_test_connection(): void {
    check_ajax_referer('imagecdn_admin', 'nonce');
    
    if (!current_user_can('manage_options')) {
        wp_send_json_error(['message' => 'Unauthorized']);
    }
    
    // ... handler code
}

// 2. Capability checks for settings access
public function render_settings_page(): void {
    if (!current_user_can('manage_options')) {
        wp_die(__('Unauthorized access', 'imagecdn-optimizer'));
    }
    
    // ... render code
}

// 3. Input sanitization
public function sanitize_public_key(string $key): string {
    // Remove whitespace
    $key = trim($key);
    
    // Validate format
    if (!preg_match('/^imgcdn_pk_[a-zA-Z0-9]{8,64}$/', $key)) {
        return '';
    }
    
    return sanitize_text_field($key);
}

// 4. Secret key never exposed
public function get_settings_for_frontend(): array {
    $settings = $this->get_all();
    
    // Never expose secret key
    unset($settings['secret_key']);
    
    return $settings;
}

// 5. Output escaping
public function render_cdn_url_preview(): void {
    $url = $this->get_sample_cdn_url();
    echo '<code>' . esc_html($url) . '</code>';
}

// 6. Parameter allowlisting
private function validate_transform_param(string $key, $value): bool {
    $allowed = [
        'w' => 'is_numeric',
        'h' => 'is_numeric',
        'q' => function($v) { return is_numeric($v) && $v >= 1 && $v <= 100; },
        'f' => function($v) { return in_array($v, ['auto', 'webp', 'avif', 'jpeg', 'png']); },
        'fit' => function($v) { return in_array($v, ['cover', 'contain', 'fill']); },
    ];
    
    if (!isset($allowed[$key])) {
        return false;
    }
    
    return call_user_func($allowed[$key], $value);
}
```

---

## WooCommerce Integration

```php
<?php
/**
 * WooCommerce integration for product images
 */
class ImageCDN_WooCommerce {
    private ImageCDN_Rewriter $rewriter;
    private ImageCDN_Settings $settings;
    
    public function __construct(ImageCDN_Rewriter $rewriter, ImageCDN_Settings $settings) {
        $this->rewriter = $rewriter;
        $this->settings = $settings;
    }
    
    /**
     * Initialize WooCommerce hooks
     */
    public function init(): void {
        if (!$this->is_woocommerce_active()) {
            return;
        }
        
        // Product images
        add_filter('woocommerce_product_get_image', [$this, 'filter_product_image'], 999, 2);
        
        // Gallery images
        add_filter('woocommerce_single_product_image_thumbnail_html', [$this, 'filter_gallery_thumbnail'], 999);
        
        // Gallery main image
        add_filter('woocommerce_single_product_image_gallery_classes', [$this, 'add_gallery_classes']);
        
        // Product thumbnails in loops
        add_action('woocommerce_before_shop_loop_item_title', [$this, 'filter_loop_thumbnail'], 9);
        
        // Cart thumbnails
        add_filter('woocommerce_cart_item_thumbnail', [$this, 'filter_cart_thumbnail'], 999, 3);
        
        // Variation images
        add_filter('woocommerce_available_variation', [$this, 'filter_variation_image'], 999, 3);
    }
    
    /**
     * Check if WooCommerce is active
     */
    private function is_woocommerce_active(): bool {
        return class_exists('WooCommerce');
    }
    
    /**
     * Filter product image HTML
     */
    public function filter_product_image(string $html, WC_Product $product): string {
        return $this->rewriter->process_img_tag($html);
    }
    
    /**
     * Filter gallery thumbnail HTML
     */
    public function filter_gallery_thumbnail(string $html): string {
        // Process main image
        $html = $this->rewriter->process_img_tag($html);
        
        // Process data-large_image attribute for zoom
        if (preg_match('/data-large_image=["\']([^"\']+)["\']/', $html, $matches)) {
            $large_url = $matches[1];
            if ($this->rewriter->should_rewrite_url($large_url)) {
                $cdn_url = $this->rewriter->build_cdn_url($large_url, [
                    'width' => 1200,
                    'quality' => 90,
                ]);
                $html = str_replace($large_url, $cdn_url, $html);
            }
        }
        
        return $html;
    }
    
    /**
     * Filter variation image data
     */
    public function filter_variation_image(array $data, WC_Product $product, WC_Product_Variation $variation): array {
        // Main image
        if (!empty($data['image']['url'])) {
            $data['image']['url'] = $this->rewriter->build_cdn_url(
                $data['image']['url'],
                ['width' => 600]
            );
        }
        
        // Full image for zoom
        if (!empty($data['image']['full_src'])) {
            $data['image']['full_src'] = $this->rewriter->build_cdn_url(
                $data['image']['full_src'],
                ['width' => 1200]
            );
        }
        
        // Srcset
        if (!empty($data['image']['srcset'])) {
            $data['image']['srcset'] = $this->process_srcset_string($data['image']['srcset']);
        }
        
        return $data;
    }
    
    /**
     * Process srcset string to use CDN URLs
     */
    private function process_srcset_string(string $srcset): string {
        $parts = explode(',', $srcset);
        $processed = [];
        
        foreach ($parts as $part) {
            $part = trim($part);
            if (preg_match('/^(.+)\s+(\d+w)$/', $part, $matches)) {
                $url = $matches[1];
                $width_descriptor = $matches[2];
                $width = (int) $width_descriptor;
                
                if ($this->rewriter->should_rewrite_url($url)) {
                    $url = $this->rewriter->build_cdn_url($url, ['width' => $width]);
                }
                
                $processed[] = $url . ' ' . $width_descriptor;
            } else {
                $processed[] = $part;
            }
        }
        
        return implode(', ', $processed);
    }
}
```

---

## Compatibility Matrix

### WordPress Versions

| Version | Status | Notes |
|---------|--------|-------|
| 6.4+ | ✅ Full Support | Primary target |
| 6.0-6.3 | ✅ Full Support | Tested |
| 5.9 | ✅ Supported | Minimum version |
| 5.0-5.8 | ⚠️ Limited | May work, not tested |
| < 5.0 | ❌ Not Supported | No Gutenberg |

### PHP Versions

| Version | Status |
|---------|--------|
| 8.2+ | ✅ Full Support |
| 8.1 | ✅ Full Support |
| 8.0 | ✅ Supported |
| 7.4 | ✅ Minimum |
| < 7.4 | ❌ Not Supported |

### Plugin Compatibility

| Plugin | Status | Notes |
|--------|--------|-------|
| **Caching** | | |
| WP Super Cache | ✅ Compatible | No conflicts |
| W3 Total Cache | ✅ Compatible | No conflicts |
| WP Rocket | ✅ Compatible | Disable their lazy load |
| LiteSpeed Cache | ✅ Compatible | Disable their image optimization |
| **Page Builders** | | |
| Elementor | ✅ Compatible | Filter works on output |
| Divi | ✅ Compatible | Filter works on output |
| Beaver Builder | ✅ Compatible | Filter works on output |
| WPBakery | ✅ Compatible | Filter works on output |
| **SEO** | | |
| Yoast SEO | ✅ Compatible | No conflicts |
| Rank Math | ✅ Compatible | No conflicts |
| **E-commerce** | | |
| WooCommerce | ✅ Integrated | Dedicated integration |
| Easy Digital Downloads | ✅ Compatible | Generic image filters work |
| **Image Optimization** | | |
| Smush | ⚠️ Redundant | Disable one or the other |
| ShortPixel | ⚠️ Redundant | Disable one or the other |
| Imagify | ⚠️ Redundant | Disable one or the other |
| **Lazy Load** | | |
| Native WP (5.5+) | ✅ Detected | Auto-disabled if native used |
| a3 Lazy Load | ⚠️ Conflict | Disable our lazy load |
| Lazy Load by WP Rocket | ⚠️ Conflict | Disable our lazy load |

### Compatibility Detection

```php
<?php
/**
 * Detect conflicting plugins and adjust behavior
 */
class ImageCDN_Detector {
    /**
     * Check for lazy load conflicts
     */
    public function has_lazy_load_plugin(): bool {
        $lazy_load_plugins = [
            'a3-lazy-load/a3-lazy-load.php',
            'rocket-lazy-load/rocket-lazy-load.php',
            'lazy-load/lazy-load.php',
            'wp-smushit/wp-smush.php', // Smush has lazy load
        ];
        
        foreach ($lazy_load_plugins as $plugin) {
            if (is_plugin_active($plugin)) {
                return true;
            }
        }
        
        // Check for theme lazy load
        if (current_theme_supports('lazy-load')) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Check for image optimization conflicts
     */
    public function has_image_optimizer(): bool {
        $optimizers = [
            'wp-smushit/wp-smush.php',
            'shortpixel-image-optimiser/wp-shortpixel.php',
            'imagify/imagify.php',
            'ewww-image-optimizer/ewww-image-optimizer.php',
        ];
        
        foreach ($optimizers as $plugin) {
            if (is_plugin_active($plugin)) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Detect WooCommerce
     */
    public function has_woocommerce(): bool {
        return class_exists('WooCommerce');
    }
    
    /**
     * Get compatibility warnings
     */
    public function get_warnings(): array {
        $warnings = [];
        
        if ($this->has_lazy_load_plugin()) {
            $warnings[] = [
                'type' => 'info',
                'message' => __('Another lazy load plugin detected. ImageCDN lazy load has been disabled to prevent conflicts.', 'imagecdn-optimizer'),
            ];
        }
        
        if ($this->has_image_optimizer()) {
            $warnings[] = [
                'type' => 'warning',
                'message' => __('Another image optimization plugin detected. Consider disabling it as ImageCDN handles optimization at the CDN level.', 'imagecdn-optimizer'),
            ];
        }
        
        return $warnings;
    }
}
```

---

## Performance Optimization

### Caching Strategy

```php
<?php
/**
 * Performance optimizations for the plugin
 */
class ImageCDN_Performance {
    /**
     * Cache settings in memory during request
     */
    private static ?array $cached_settings = null;
    
    public static function get_settings(): array {
        if (self::$cached_settings === null) {
            self::$cached_settings = get_option(ImageCDN_Settings::OPTION_KEY, []);
        }
        return self::$cached_settings;
    }
    
    /**
     * Cache CDN base URL computation
     */
    private static ?string $cached_cdn_url = null;
    
    public static function get_cdn_url(): string {
        if (self::$cached_cdn_url === null) {
            $settings = self::get_settings();
            $cdn_url = $settings['cdn_url'] ?? 'https://cdn.imagecdn.io';
            $public_key = $settings['public_key'] ?? '';
            self::$cached_cdn_url = rtrim($cdn_url, '/') . '/' . $public_key;
        }
        return self::$cached_cdn_url;
    }
}
```

### Conditional Loading

```php
<?php
/**
 * Only load rewriter when needed
 */
class ImageCDN {
    public function init(): void {
        // Always load admin
        if (is_admin()) {
            $this->admin = new ImageCDN_Admin($this->settings);
            return;
        }
        
        // Skip if not enabled
        if (!$this->settings->is_enabled()) {
            return;
        }
        
        // Skip for REST API
        if ($this->is_rest_request()) {
            return;
        }
        
        // Skip for AJAX
        if (wp_doing_ajax()) {
            return;
        }
        
        // Skip for cron
        if (wp_doing_cron()) {
            return;
        }
        
        // Skip for CLI
        if (defined('WP_CLI') && WP_CLI) {
            return;
        }
        
        // Initialize rewriter for frontend only
        $this->rewriter = new ImageCDN_Rewriter($this->settings);
        $this->rewriter->init();
    }
    
    private function is_rest_request(): bool {
        if (defined('REST_REQUEST') && REST_REQUEST) {
            return true;
        }
        
        $rest_prefix = rest_get_url_prefix();
        $request_uri = $_SERVER['REQUEST_URI'] ?? '';
        
        return strpos($request_uri, '/' . $rest_prefix . '/') !== false;
    }
}
```

### Output Buffer Usage

```php
<?php
/**
 * Minimal output buffering implementation
 */
class ImageCDN_Rewriter {
    /**
     * Start output buffer only when necessary
     */
    public function start_output_buffer(): void {
        // Only for 'all_images' mode
        if ($this->settings->get('mode') !== 'all_images') {
            return;
        }
        
        // Skip admin
        if (is_admin()) {
            return;
        }
        
        // Skip feeds
        if (is_feed()) {
            return;
        }
        
        // Skip if caching plugin will handle
        if ($this->is_cached_request()) {
            return;
        }
        
        ob_start([$this, 'process_output_buffer']);
    }
    
    /**
     * Process buffered output
     */
    public function process_output_buffer(string $html): string {
        // Only process HTML responses
        if (!$this->is_html_response($html)) {
            return $html;
        }
        
        return $this->process_content_images($html);
    }
    
    /**
     * Check if output is HTML
     */
    private function is_html_response(string $content): bool {
        return stripos($content, '<!DOCTYPE html') !== false || 
               stripos($content, '<html') !== false;
    }
}
```

---

## Manual QA Checklist

### Installation Testing

- [ ] Plugin installs without errors on clean WordPress
- [ ] Plugin activates without errors
- [ ] Plugin deactivates cleanly
- [ ] Plugin uninstalls and removes all data
- [ ] Settings page accessible after activation
- [ ] No PHP errors in debug.log

### Settings UI Testing

- [ ] All fields render correctly
- [ ] Public key validation works
- [ ] Secret key is masked/hidden
- [ ] Test Connection button works
- [ ] Error messages are clear and actionable
- [ ] Settings save correctly
- [ ] Settings persist after save
- [ ] Reset to defaults works

### URL Rewriting Testing

| Test | Expected Result |
|------|-----------------|
| Post content images | Rewritten to CDN URLs |
| Featured images | Rewritten to CDN URLs |
| Gallery images | Rewritten to CDN URLs |
| Widget images | Rewritten to CDN URLs |
| External images | NOT rewritten |
| Data URIs | NOT rewritten |
| Admin images | NOT rewritten |
| Already-CDN URLs | NOT double-rewritten |

### Srcset Testing

- [ ] Srcset contains CDN URLs
- [ ] Srcset widths are appropriate
- [ ] Sizes attribute is present
- [ ] No HTML bloat (max 6 entries)
- [ ] Original aspect ratio preserved

### Lazy Loading Testing

- [ ] `loading="lazy"` added to images
- [ ] Not added if already present
- [ ] Not added if disabled in settings
- [ ] Not added if another lazy load plugin active

### WooCommerce Testing

- [ ] Product images on shop page
- [ ] Product images on single product
- [ ] Gallery images with zoom
- [ ] Cart thumbnails
- [ ] Variation images
- [ ] Category thumbnails

### Compatibility Testing

| Test | Plugin/Theme |
|------|--------------|
| Caching | WP Super Cache |
| Caching | W3 Total Cache |
| Caching | WP Rocket |
| Builder | Elementor |
| Builder | Divi |
| SEO | Yoast |
| E-commerce | WooCommerce |

### Performance Testing

- [ ] Page load time not significantly impacted
- [ ] No memory leaks on large pages
- [ ] Admin pages load quickly
- [ ] AJAX requests complete quickly

### Security Testing

- [ ] Settings require admin capability
- [ ] AJAX actions verify nonces
- [ ] Secret key not exposed in HTML
- [ ] API key validated before saving
- [ ] No XSS vulnerabilities
- [ ] No SQL injection vulnerabilities

### Edge Cases

- [ ] Empty content handled
- [ ] Malformed URLs handled
- [ ] Missing images handled
- [ ] Very large pages handled
- [ ] Multisite works correctly
- [ ] RTL languages supported

---

## Appendix: Error Messages

### Connection Errors

| Code | Message | Action |
|------|---------|--------|
| `INVALID_KEY` | Invalid API key | Check key format |
| `KEY_NOT_FOUND` | API key not recognized | Verify key in dashboard |
| `DOMAIN_NOT_AUTHORIZED` | Domain not in allowlist | Add domain in dashboard |
| `ACCOUNT_SUSPENDED` | Account suspended | Update payment method |
| `QUOTA_EXCEEDED` | Monthly quota exceeded | Upgrade plan |
| `PLAN_LIMIT` | Feature not in plan | Upgrade plan |
| `NETWORK_ERROR` | Could not connect | Check network/firewall |

### Validation Errors

| Field | Error | Resolution |
|-------|-------|------------|
| `public_key` | Invalid format | Must be `imgcdn_pk_*` |
| `secret_key` | Invalid format | Must be `imgcdn_sk_*` |
| `cdn_url` | Invalid URL | Must be valid HTTPS URL |
| `quality` | Out of range | Must be 1-100 |

---

*This specification is a living document. Update as implementation progresses.*
