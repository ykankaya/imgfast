<?php
/**
 * Imgfast URL Rewriter
 *
 * @package Imgfast
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Rewrites image URLs to use Imgfast
 */
class Imgfast_Rewriter {

    /**
     * Settings instance
     *
     * @var Imgfast_Settings
     */
    private $settings;

    /**
     * Site URL
     *
     * @var string
     */
    private $site_url;

    /**
     * Upload directory URL
     *
     * @var string
     */
    private $upload_url;

    /**
     * Supported image extensions
     *
     * @var array
     */
    private $image_extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'];

    /**
     * Constructor
     *
     * @param Imgfast_Settings $settings Settings instance
     */
    public function __construct(Imgfast_Settings $settings) {
        $this->settings = $settings;
        $this->site_url = site_url();

        $upload_dir = wp_upload_dir();
        $this->upload_url = $upload_dir['baseurl'];
    }

    /**
     * Initialize rewriter hooks
     */
    public function init() {
        // Content filters - high priority to run after other plugins
        add_filter('the_content', [$this, 'rewrite_content'], 999);
        add_filter('post_thumbnail_html', [$this, 'rewrite_html'], 999);
        add_filter('widget_text', [$this, 'rewrite_content'], 999);
        add_filter('get_avatar', [$this, 'rewrite_html'], 999);

        // Attachment URL filters
        add_filter('wp_get_attachment_image_src', [$this, 'rewrite_attachment_src'], 999, 4);
        add_filter('wp_get_attachment_url', [$this, 'rewrite_url'], 999);
        add_filter('wp_get_attachment_image_attributes', [$this, 'rewrite_image_attributes'], 999, 3);

        // Srcset filter
        if ($this->settings->get('include_srcset')) {
            add_filter('wp_calculate_image_srcset', [$this, 'rewrite_srcset'], 999, 5);
        }

        // WooCommerce support
        if (class_exists('WooCommerce')) {
            add_filter('woocommerce_product_get_image', [$this, 'rewrite_html'], 999);
            add_filter('woocommerce_single_product_image_thumbnail_html', [$this, 'rewrite_html'], 999);
        }

        // ACF support
        if (class_exists('ACF')) {
            add_filter('acf/format_value/type=image', [$this, 'rewrite_acf_image'], 999, 3);
        }
    }

    /**
     * Rewrite all image URLs in HTML content
     *
     * @param string $content HTML content
     * @return string Modified content
     */
    public function rewrite_content($content) {
        if (empty($content)) {
            return $content;
        }

        // Process all img tags
        $content = preg_replace_callback(
            '/<img[^>]+>/i',
            [$this, 'process_img_tag'],
            $content
        );

        // Process background images in inline styles
        $content = preg_replace_callback(
            '/background(-image)?:\s*url\([\'"]?([^\'")\s]+)[\'"]?\)/i',
            [$this, 'process_background_url'],
            $content
        );

        return $content;
    }

    /**
     * Rewrite HTML containing image tags
     *
     * @param string $html HTML string
     * @return string Modified HTML
     */
    public function rewrite_html($html) {
        return $this->rewrite_content($html);
    }

    /**
     * Process individual img tag
     *
     * @param array $matches Regex matches
     * @return string Modified img tag
     */
    private function process_img_tag($matches) {
        $img_tag = $matches[0];

        // Skip if already processed
        if (strpos($img_tag, 'data-imgfast-skip') !== false) {
            return $img_tag;
        }

        // Extract and rewrite src
        if (preg_match('/src=["\']([^"\']+)["\']/i', $img_tag, $src_match)) {
            $original_url = $src_match[1];

            if ($this->should_rewrite($original_url)) {
                $dimensions = $this->extract_dimensions($img_tag);
                $cdn_url = $this->build_cdn_url($original_url, $dimensions);
                $img_tag = str_replace($src_match[0], 'src="' . esc_url($cdn_url) . '"', $img_tag);

                // Mark as processed
                $img_tag = str_replace('<img', '<img data-imgfast-original="' . esc_attr($original_url) . '"', $img_tag);
            }
        }

        // Process srcset
        if (preg_match('/srcset=["\']([^"\']+)["\']/i', $img_tag, $srcset_match)) {
            $new_srcset = $this->rewrite_srcset_string($srcset_match[1]);
            $img_tag = str_replace($srcset_match[0], 'srcset="' . esc_attr($new_srcset) . '"', $img_tag);
        }

        // Add lazy loading if enabled
        if ($this->settings->get('lazy_load') && strpos($img_tag, 'loading=') === false) {
            $img_tag = str_replace('<img', '<img loading="lazy"', $img_tag);
        }

        return $img_tag;
    }

    /**
     * Process background URL in CSS
     *
     * @param array $matches Regex matches
     * @return string Modified CSS
     */
    private function process_background_url($matches) {
        $full_match = $matches[0];
        $url = $matches[2];

        if ($this->should_rewrite($url)) {
            $cdn_url = $this->build_cdn_url($url);
            return str_replace($url, $cdn_url, $full_match);
        }

        return $full_match;
    }

    /**
     * Rewrite attachment source array
     *
     * @param array|false $image Image data array or false
     * @param int $attachment_id Attachment ID
     * @param string|int[] $size Image size
     * @param bool $icon Whether to use icon
     * @return array|false Modified image data
     */
    public function rewrite_attachment_src($image, $attachment_id, $size, $icon) {
        if (!$image || !is_array($image)) {
            return $image;
        }

        if ($this->should_rewrite($image[0])) {
            $params = [];
            if (!empty($image[1])) {
                $params['width'] = $image[1];
            }
            if (!empty($image[2])) {
                $params['height'] = $image[2];
            }

            $image[0] = $this->build_cdn_url($image[0], $params);
        }

        return $image;
    }

    /**
     * Rewrite single URL
     *
     * @param string $url Original URL
     * @return string Modified URL
     */
    public function rewrite_url($url) {
        if ($this->should_rewrite($url)) {
            return $this->build_cdn_url($url);
        }
        return $url;
    }

    /**
     * Rewrite image attributes array
     *
     * @param array $attr Image attributes
     * @param WP_Post $attachment Attachment post object
     * @param string|int[] $size Requested image size
     * @return array Modified attributes
     */
    public function rewrite_image_attributes($attr, $attachment, $size) {
        if (isset($attr['src']) && $this->should_rewrite($attr['src'])) {
            $params = [];
            if (isset($attr['width'])) {
                $params['width'] = $attr['width'];
            }
            if (isset($attr['height'])) {
                $params['height'] = $attr['height'];
            }

            $attr['data-imgfast-original'] = $attr['src'];
            $attr['src'] = $this->build_cdn_url($attr['src'], $params);
        }

        return $attr;
    }

    /**
     * Rewrite srcset array from WordPress
     *
     * @param array $sources Srcset sources
     * @param array $size_array Width and height
     * @param string $image_src Image source URL
     * @param array $image_meta Image metadata
     * @param int $attachment_id Attachment ID
     * @return array Modified sources
     */
    public function rewrite_srcset($sources, $size_array, $image_src, $image_meta, $attachment_id) {
        if (!is_array($sources)) {
            return $sources;
        }

        foreach ($sources as $width => &$source) {
            if (isset($source['url']) && $this->should_rewrite($source['url'])) {
                $source['url'] = $this->build_cdn_url($source['url'], [
                    'width' => $width,
                ]);
            }
        }

        return $sources;
    }

    /**
     * Rewrite srcset string
     *
     * @param string $srcset Srcset attribute value
     * @return string Modified srcset
     */
    private function rewrite_srcset_string($srcset) {
        $sources = explode(',', $srcset);
        $new_sources = [];

        foreach ($sources as $source) {
            $source = trim($source);
            if (preg_match('/^(\S+)(\s+.+)?$/', $source, $parts)) {
                $url = $parts[1];
                $descriptor = $parts[2] ?? '';

                if ($this->should_rewrite($url)) {
                    // Extract width from descriptor
                    $width = null;
                    if (preg_match('/(\d+)w/', $descriptor, $width_match)) {
                        $width = (int) $width_match[1];
                    }

                    $url = $this->build_cdn_url($url, $width ? ['width' => $width] : []);
                }

                $new_sources[] = $url . $descriptor;
            }
        }

        return implode(', ', $new_sources);
    }

    /**
     * Rewrite ACF image field
     *
     * @param mixed $value Field value
     * @param int $post_id Post ID
     * @param array $field Field config
     * @return mixed Modified value
     */
    public function rewrite_acf_image($value, $post_id, $field) {
        if (is_array($value) && isset($value['url'])) {
            if ($this->should_rewrite($value['url'])) {
                $value['url'] = $this->build_cdn_url($value['url'], [
                    'width' => $value['width'] ?? null,
                    'height' => $value['height'] ?? null,
                ]);
            }

            // Rewrite sizes
            if (isset($value['sizes']) && is_array($value['sizes'])) {
                foreach ($value['sizes'] as $size_name => $size_url) {
                    if (is_string($size_url) && $this->should_rewrite($size_url)) {
                        $width = $value['sizes'][$size_name . '-width'] ?? null;
                        $value['sizes'][$size_name] = $this->build_cdn_url($size_url, [
                            'width' => $width,
                        ]);
                    }
                }
            }
        } elseif (is_string($value) && $this->should_rewrite($value)) {
            $value = $this->build_cdn_url($value);
        }

        return $value;
    }

    /**
     * Check if URL should be rewritten
     *
     * @param string $url URL to check
     * @return bool
     */
    public function should_rewrite($url) {
        // Skip empty URLs
        if (empty($url)) {
            return false;
        }

        // Skip data URIs
        if (strpos($url, 'data:') === 0) {
            return false;
        }

        // Skip if not local
        if (!$this->is_local_url($url)) {
            return false;
        }

        // Skip if not an image
        if (!$this->is_image_url($url)) {
            return false;
        }

        // Skip excluded paths
        foreach ($this->settings->get('excluded_paths') as $path) {
            if (!empty($path) && strpos($url, $path) !== false) {
                return false;
            }
        }

        // Skip if already CDN URL
        if (strpos($url, $this->settings->get_cdn_base_url()) !== false) {
            return false;
        }

        return true;
    }

    /**
     * Build CDN URL with transformation parameters
     *
     * @param string $original_url Original image URL
     * @param array $params Transformation parameters
     * @return string CDN URL
     */
    public function build_cdn_url($original_url, $params = []) {
        $cdn_base = $this->settings->get_cdn_base_url();
        $path = $this->url_to_path($original_url);

        // Build query parameters
        $query_params = [];

        if (!empty($params['width'])) {
            $query_params['w'] = (int) $params['width'];
        }
        if (!empty($params['height'])) {
            $query_params['h'] = (int) $params['height'];
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
     * Convert URL to relative path
     *
     * @param string $url Full URL
     * @return string Relative path
     */
    private function url_to_path($url) {
        // Remove protocol
        $url = preg_replace('#^https?://#', '', $url);

        // Remove domain
        $site_domain = preg_replace('#^https?://#', '', $this->site_url);
        $url = preg_replace('#^' . preg_quote($site_domain, '#') . '#', '', $url);

        return ltrim($url, '/');
    }

    /**
     * Extract dimensions from img tag
     *
     * @param string $img_tag Full img tag
     * @return array Width and height if found
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

    /**
     * Check if URL is local
     *
     * @param string $url URL to check
     * @return bool
     */
    private function is_local_url($url) {
        // Relative URLs are local
        if (strpos($url, '/') === 0 && strpos($url, '//') !== 0) {
            return true;
        }

        // Check if URL contains site domain
        $site_domain = parse_url($this->site_url, PHP_URL_HOST);
        $url_domain = parse_url($url, PHP_URL_HOST);

        return $url_domain === $site_domain;
    }

    /**
     * Check if URL points to an image
     *
     * @param string $url URL to check
     * @return bool
     */
    private function is_image_url($url) {
        $path = parse_url($url, PHP_URL_PATH);
        if (!$path) {
            return false;
        }

        $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        return in_array($ext, $this->image_extensions);
    }
}
