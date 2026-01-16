<?php
/**
 * Imgfast Gutenberg Blocks Handler
 *
 * @package Imgfast
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Handles Gutenberg block registration and rendering
 */
class Imgfast_Blocks {

    /**
     * Settings instance
     *
     * @var Imgfast_Settings
     */
    private $settings;

    /**
     * Constructor
     *
     * @param Imgfast_Settings $settings Settings instance
     */
    public function __construct(Imgfast_Settings $settings) {
        $this->settings = $settings;
    }

    /**
     * Initialize blocks
     */
    public function init() {
        add_action('init', [$this, 'register_blocks']);
        add_action('enqueue_block_editor_assets', [$this, 'enqueue_editor_assets']);
        add_filter('render_block_imgfast/optimized-image', [$this, 'render_block'], 10, 2);
    }

    /**
     * Register blocks
     */
    public function register_blocks() {
        // Check if block registration function exists (WP 5.0+)
        if (!function_exists('register_block_type')) {
            return;
        }

        register_block_type(
            IMGFAST_PLUGIN_DIR . 'blocks/imgfast-image',
            [
                'render_callback' => [$this, 'render_block'],
            ]
        );
    }

    /**
     * Enqueue editor assets
     */
    public function enqueue_editor_assets() {
        // Pass configuration to block editor
        wp_localize_script(
            'imgfast-optimized-image-editor-script',
            'imgfastBlock',
            [
                'enabled' => $this->settings->is_enabled(),
                'cdnBase' => $this->settings->get_cdn_base_url(),
                'defaultQuality' => $this->settings->get('default_quality'),
                'autoFormat' => $this->settings->get('auto_webp'),
                'publicKey' => $this->settings->get('public_key'),
            ]
        );
    }

    /**
     * Server-side render for the block
     *
     * @param string $block_content Original block content
     * @param array  $block         Block data
     * @return string Modified block content
     */
    public function render_block($block_content, $block) {
        // If plugin is not enabled, return original content
        if (!$this->settings->is_enabled()) {
            return $block_content;
        }

        $attrs = $block['attrs'] ?? [];

        // Get image URL from attributes
        $url = $attrs['url'] ?? '';

        if (empty($url)) {
            return $block_content;
        }

        // Build transformation params
        $params = [
            'width' => $attrs['width'] ?? null,
            'height' => $attrs['height'] ?? null,
            'quality' => $attrs['quality'] ?? $this->settings->get('default_quality'),
            'format' => $attrs['format'] ?? 'auto',
            'fit' => $attrs['fit'] ?? 'cover',
        ];

        // Create rewriter instance
        $rewriter = new Imgfast_Rewriter($this->settings);

        // Build CDN URL
        $cdn_url = $rewriter->build_cdn_url($url, $params);

        // Get other attributes
        $alt = esc_attr($attrs['alt'] ?? '');
        $caption = $attrs['caption'] ?? '';
        $align = $attrs['align'] ?? '';

        // Build class names
        $class_names = ['wp-block-imgfast-optimized-image'];
        if ($align) {
            $class_names[] = 'align' . $align;
        }

        // Build image attributes
        $img_attrs = [
            'src' => $cdn_url,
            'alt' => $alt,
            'loading' => 'lazy',
            'decoding' => 'async',
        ];

        if (!empty($params['width'])) {
            $img_attrs['width'] = (int) $params['width'];
        }
        if (!empty($params['height'])) {
            $img_attrs['height'] = (int) $params['height'];
        }

        // Build srcset if dimensions are known
        $srcset = $this->build_srcset($url, $params, $rewriter);
        if ($srcset) {
            $img_attrs['srcset'] = $srcset;
            $img_attrs['sizes'] = $this->get_sizes_attribute($params['width'] ?? null, $align);
        }

        // Build HTML
        $img_html = '<img';
        foreach ($img_attrs as $attr => $value) {
            $img_html .= sprintf(' %s="%s"', $attr, esc_attr($value));
        }
        $img_html .= '>';

        $html = sprintf(
            '<figure class="%s">%s',
            esc_attr(implode(' ', $class_names)),
            $img_html
        );

        if ($caption) {
            $html .= sprintf(
                '<figcaption class="wp-element-caption">%s</figcaption>',
                wp_kses_post($caption)
            );
        }

        $html .= '</figure>';

        return $html;
    }

    /**
     * Build srcset attribute for responsive images
     *
     * @param string              $url      Original image URL
     * @param array               $params   Transform params
     * @param Imgfast_Rewriter   $rewriter Rewriter instance
     * @return string|null
     */
    private function build_srcset($url, $params, $rewriter) {
        if (!$this->settings->get('include_srcset')) {
            return null;
        }

        $base_width = $params['width'] ?? 800;
        $quality = $params['quality'] ?? 80;
        $format = $params['format'] ?? 'auto';
        $fit = $params['fit'] ?? 'cover';

        // Standard responsive widths
        $widths = [320, 640, 768, 1024, 1280, 1536, 1920];

        // Filter widths based on base width
        $widths = array_filter($widths, function($w) use ($base_width) {
            return $w <= $base_width * 1.5;
        });

        if (empty($widths)) {
            return null;
        }

        $srcset_parts = [];

        foreach ($widths as $width) {
            $cdn_url = $rewriter->build_cdn_url($url, [
                'width' => $width,
                'quality' => $quality,
                'format' => $format,
                'fit' => $fit,
            ]);
            $srcset_parts[] = $cdn_url . ' ' . $width . 'w';
        }

        return implode(', ', $srcset_parts);
    }

    /**
     * Get sizes attribute based on width and alignment
     *
     * @param int|null $width Image width
     * @param string   $align Alignment
     * @return string
     */
    private function get_sizes_attribute($width, $align) {
        if ($align === 'full') {
            return '100vw';
        }

        if ($align === 'wide') {
            return '(max-width: 1200px) 100vw, 1200px';
        }

        if ($width) {
            return sprintf('(max-width: %dpx) 100vw, %dpx', $width, $width);
        }

        return '(max-width: 800px) 100vw, 800px';
    }
}
