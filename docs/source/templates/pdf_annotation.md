---
title: PDF Annotation
type: templates
category: Structured Data Parsing
cat: structured-data-parsing
order: 431
meta_title: PDF Annotation Data Labeling Template
meta_description: Template for annotating PDF data with Label Studio for your machine learning and data science projects.
---

<img src="/images/templates/pdf-classification.png" alt="" class="gif-border" width="552px" height="408px" />

If you want to perform PDF annotation, use this template.

## Interactive Template Preview

<div id="main-preview"></div>

## Labeling Configuration

```html
<View>
  <Labels name="label" toName="pdf">
    <label value="Person" background="#FF0000" />
    <label value="Organization" background="#0000FF" />
    <label value="Location" background="#00FF00" />
    <label value="Date" background="#FFA500" />
  </Labels>
  <PDF name="pdf" value="$url" />
</View>
```

## About the labeling configuration

All labeling configurations must be wrapped in [View](/tags/view.html) tags.
