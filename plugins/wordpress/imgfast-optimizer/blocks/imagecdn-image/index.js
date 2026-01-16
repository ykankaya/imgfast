/**
 * Imgfast Optimized Image Block
 *
 * @package Imgfast
 */

(function(wp) {
    'use strict';

    const { registerBlockType } = wp.blocks;
    const { useBlockProps, InspectorControls, MediaUpload, MediaUploadCheck, BlockControls } = wp.blockEditor;
    const { PanelBody, RangeControl, SelectControl, Button, Placeholder, ToolbarGroup, ToolbarButton } = wp.components;
    const { Fragment, useState, useEffect } = wp.element;
    const { __ } = wp.i18n;

    /**
     * Build CDN URL from image URL and transformation params
     */
    function buildCdnUrl(originalUrl, params) {
        if (!originalUrl || !window.imgfastBlock) {
            return originalUrl;
        }

        const config = window.imgfastBlock;

        if (!config.enabled || !config.cdnBase) {
            return originalUrl;
        }

        // Extract path from original URL
        let path = originalUrl;
        try {
            const url = new URL(originalUrl);
            path = url.pathname;
        } catch (e) {
            // If not a valid URL, use as-is
        }

        // Build query params
        const queryParams = new URLSearchParams();

        if (params.width) {
            queryParams.set('w', params.width);
        }
        if (params.height) {
            queryParams.set('h', params.height);
        }
        if (params.quality) {
            queryParams.set('q', params.quality);
        }
        if (params.format && params.format !== 'auto') {
            queryParams.set('f', params.format);
        } else if (config.autoFormat) {
            queryParams.set('f', 'auto');
        }
        if (params.fit) {
            queryParams.set('fit', params.fit);
        }

        const queryString = queryParams.toString();
        return config.cdnBase + path + (queryString ? '?' + queryString : '');
    }

    /**
     * Edit component for the block
     */
    function Edit({ attributes, setAttributes }) {
        const {
            id,
            url,
            alt,
            width,
            height,
            quality,
            format,
            fit,
            sizeSlug
        } = attributes;

        const [previewUrl, setPreviewUrl] = useState(url);

        // Update preview URL when attributes change
        useEffect(() => {
            if (url) {
                setPreviewUrl(buildCdnUrl(url, { width, height, quality, format, fit }));
            }
        }, [url, width, height, quality, format, fit]);

        const blockProps = useBlockProps({
            className: 'wp-block-imgfast-optimized-image'
        });

        const onSelectImage = (media) => {
            setAttributes({
                id: media.id,
                url: media.url,
                alt: media.alt || '',
                width: media.width,
                height: media.height
            });
        };

        const onRemoveImage = () => {
            setAttributes({
                id: undefined,
                url: undefined,
                alt: '',
                width: undefined,
                height: undefined
            });
        };

        // Image sizes for dropdown
        const imageSizes = [
            { label: __('Thumbnail', 'imgfast-optimizer'), value: 'thumbnail' },
            { label: __('Medium', 'imgfast-optimizer'), value: 'medium' },
            { label: __('Large', 'imgfast-optimizer'), value: 'large' },
            { label: __('Full Size', 'imgfast-optimizer'), value: 'full' }
        ];

        // Format options
        const formatOptions = [
            { label: __('Auto (Best)', 'imgfast-optimizer'), value: 'auto' },
            { label: 'WebP', value: 'webp' },
            { label: 'AVIF', value: 'avif' },
            { label: 'JPEG', value: 'jpeg' },
            { label: 'PNG', value: 'png' }
        ];

        // Fit options
        const fitOptions = [
            { label: __('Cover', 'imgfast-optimizer'), value: 'cover' },
            { label: __('Contain', 'imgfast-optimizer'), value: 'contain' },
            { label: __('Fill', 'imgfast-optimizer'), value: 'fill' },
            { label: __('Inside', 'imgfast-optimizer'), value: 'inside' },
            { label: __('Outside', 'imgfast-optimizer'), value: 'outside' }
        ];

        return (
            <Fragment>
                <InspectorControls>
                    <PanelBody title={__('Image Settings', 'imgfast-optimizer')}>
                        <SelectControl
                            label={__('Image Size', 'imgfast-optimizer')}
                            value={sizeSlug}
                            options={imageSizes}
                            onChange={(value) => setAttributes({ sizeSlug: value })}
                        />
                    </PanelBody>

                    <PanelBody title={__('CDN Optimization', 'imgfast-optimizer')} initialOpen={true}>
                        <RangeControl
                            label={__('Width (px)', 'imgfast-optimizer')}
                            value={width}
                            onChange={(value) => setAttributes({ width: value })}
                            min={50}
                            max={2000}
                            allowReset
                        />

                        <RangeControl
                            label={__('Height (px)', 'imgfast-optimizer')}
                            value={height}
                            onChange={(value) => setAttributes({ height: value })}
                            min={50}
                            max={2000}
                            allowReset
                        />

                        <RangeControl
                            label={__('Quality', 'imgfast-optimizer')}
                            value={quality}
                            onChange={(value) => setAttributes({ quality: value })}
                            min={1}
                            max={100}
                            help={__('Lower quality = smaller file size', 'imgfast-optimizer')}
                        />

                        <SelectControl
                            label={__('Format', 'imgfast-optimizer')}
                            value={format}
                            options={formatOptions}
                            onChange={(value) => setAttributes({ format: value })}
                            help={__('Auto selects best format based on browser', 'imgfast-optimizer')}
                        />

                        <SelectControl
                            label={__('Fit Mode', 'imgfast-optimizer')}
                            value={fit}
                            options={fitOptions}
                            onChange={(value) => setAttributes({ fit: value })}
                        />
                    </PanelBody>
                </InspectorControls>

                {url && (
                    <BlockControls>
                        <ToolbarGroup>
                            <MediaUploadCheck>
                                <MediaUpload
                                    onSelect={onSelectImage}
                                    allowedTypes={['image']}
                                    value={id}
                                    render={({ open }) => (
                                        <ToolbarButton
                                            onClick={open}
                                            icon="edit"
                                            label={__('Replace Image', 'imgfast-optimizer')}
                                        />
                                    )}
                                />
                            </MediaUploadCheck>
                        </ToolbarGroup>
                    </BlockControls>
                )}

                <div {...blockProps}>
                    {!url ? (
                        <MediaUploadCheck>
                            <MediaUpload
                                onSelect={onSelectImage}
                                allowedTypes={['image']}
                                value={id}
                                render={({ open }) => (
                                    <Placeholder
                                        icon="format-image"
                                        label={__('Imgfast Image', 'imgfast-optimizer')}
                                        instructions={__('Upload or select an image to optimize via Imgfast', 'imgfast-optimizer')}
                                    >
                                        <Button
                                            variant="primary"
                                            onClick={open}
                                        >
                                            {__('Select Image', 'imgfast-optimizer')}
                                        </Button>
                                    </Placeholder>
                                )}
                            />
                        </MediaUploadCheck>
                    ) : (
                        <figure className="imgfast-image-wrapper">
                            <img
                                src={previewUrl}
                                alt={alt}
                                style={{
                                    width: width ? width + 'px' : 'auto',
                                    height: height ? height + 'px' : 'auto',
                                    objectFit: fit
                                }}
                            />
                            <div className="imgfast-image-overlay">
                                <span className="imgfast-badge">
                                    {__('CDN Optimized', 'imgfast-optimizer')}
                                </span>
                            </div>
                        </figure>
                    )}
                </div>
            </Fragment>
        );
    }

    /**
     * Save component - returns null as we render via PHP
     */
    function Save({ attributes }) {
        const {
            url,
            alt,
            width,
            height,
            quality,
            format,
            fit,
            caption
        } = attributes;

        if (!url) {
            return null;
        }

        const blockProps = wp.blockEditor.useBlockProps.save({
            className: 'wp-block-imgfast-optimized-image'
        });

        // Build data attributes for server-side rendering
        return (
            <figure {...blockProps}>
                <img
                    src={url}
                    alt={alt}
                    width={width}
                    height={height}
                    data-imgfast-quality={quality}
                    data-imgfast-format={format}
                    data-imgfast-fit={fit}
                    loading="lazy"
                />
                {caption && (
                    <figcaption className="wp-element-caption">{caption}</figcaption>
                )}
            </figure>
        );
    }

    // Register block
    registerBlockType('imgfast/optimized-image', {
        edit: Edit,
        save: Save
    });

})(window.wp);
