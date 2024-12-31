import React, { useEffect, useLayoutEffect, useRef } from "react";
import { inject, observer } from "mobx-react";
import { types, getRoot, flow } from "mobx-state-tree";
import { PdfLoader, PdfHighlighter, Highlight } from "react-pdf-highlighter";
import { parseValue } from "../../utils/data";
import ObjectBase from "./Base";
import ProcessAttrsMixin from "../../mixins/ProcessAttrs";
import IsReadyMixin from "../../mixins/IsReadyMixin";
import NormalizationMixin from "../../mixins/Normalization";
import { AreaMixin } from "../../mixins/AreaMixin";
import ObjectTag from "../../components/Tags/Object";
import Registry from "../../core/Registry";
import { ErrorMessage } from "../../components/ErrorMessage/ErrorMessage";
import { AnnotationMixin } from "../../mixins/AnnotationMixin";
import RegionsMixin from "../../mixins/Regions";
import { guidGenerator } from "../../utils/unique";
import { FF_LSDV_4620_3, isFF } from "../../utils/feature-flags";

const TagAttrs = types.model("PDFModel", {
  value: types.maybeNull(types.string),
  // name: types.maybeNull(types.string),
  selectionenabled: types.optional(types.boolean, true),
  highlightcolor: types.maybeNull(types.string),
  showlabels: types.maybeNull(types.boolean)
});

// Define the Region model
const PDFRegion = types
  .model({
    _id: types.maybeNull(types.string),
    type: "pdfregion",
    object: types.late(() => types.reference(PDFModel)),
    // highlighted: types.optional(types.boolean, false),
    position: types.frozen(),
    text: types.maybeNull(types.string),
    label: types.maybeNull(types.string)
    // content: types.frozen(),
    // label: types.string
  })
  .actions(self => ({
    serialize() {
      const res = {
        value: {
          position: self.position,
          text: self.text
        }
      };

      // Include text if it exists and if the parent object is configured to save text
      if (self.object.savetextresult === "yes" && isDefined(self.text)) {
        res.value.text = self.text;
      }

      // Include any labels if they exist
      if (self.label) {
        res.value.label = self.label;
      }

      // Include any additional metadata about the region
      if (self._id) {
        res.value.id = self._id;
      }

      return res;
    },
    toggleHidden(e) {
      self.hidden = !self.hidden;
      self.changeHighlightColor(
        self.hidden
          ? "transparent"
          : self.results[0].selectedLabels[0].background
      );
    },
    changeHighlightColor(color) {
      const highlightElement = document.querySelector(
        `[data-highlight-id="${self.id}"]`
      );
      if (highlightElement) {
        const parts = highlightElement.querySelectorAll(".Highlight__part");
        parts.forEach(part => {
          if (part instanceof HTMLElement) {
            part.style.background = color;
            part.style.display = self.hidden ? "none" : "unset";
          }
        });
      }
    },
    updateAppearenceFromState() {
      self.parent.needsUpdate();
    },

    selectRegion() {
      const color = self.results[0].selectedLabels[0].background;
      // alert(`selected = ${color}`);
      self.changeHighlightColor(color);

      // Find the highlight element
      const highlightElement = document.querySelector(
        `[data-highlight-id="${self.id}"]`
      );

      if (highlightElement) {
        // Check if element is in viewport
        const rect = highlightElement.getBoundingClientRect();
        const isInViewport =
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <=
            (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <=
            (window.innerWidth || document.documentElement.clientWidth);

        // Only scroll if element is not fully visible
        if (!isInViewport) {
          highlightElement.scrollIntoView();
        }
      }
    },

    afterUnselectRegion() {
      const color = self.results[0].selectedLabels[0].background + "26";
      // alert(`unselected = ${color}`);
      self.changeHighlightColor(color);
    },
    updateText(text) {
      self.text = text;
    },
    beforeDestroy() {
      self.parent?.deleteRegion(self.id);
    }
  }));

const Model = types
  .model({
    // name: types.identifier,
    type: "PDFModel",
    _value: types.optional(types.string, ""),
    regions: types.array(PDFRegion)
  })
  .views(self => ({
    get hasStates() {
      const states = self.states();
      return states && states.length > 0;
    },
    // get name() {
    //   return self.name || self.id;
    // },

    states() {
      return self.annotation?.toNames?.get(self.name);
    },

    activeStates() {
      const states = self.states();
      return states ? states.filter(s => s.isSelected) : null;
    }
  }))
  .actions(self => ({
    needsUpdate() {
      self.regions = [];
      self.updateRegions();
    },

    beforeDestroy() {
      self.regions = [];
    },
    destroyRegion(id) {
      self.regions = self.regions.filter(x => x._id !== id);
    },
    updateRegions() {
      self.regs.forEach(region => {
        try {
          const newRegion = {
            _id: region.id,
            type: "pdfregion",
            object: self,
            position: region.position,
            label: region.labels[0],
            selected: true
          };
          if (!region.text) region.updateText(region.results[0].value.text);

          self.regions.push(newRegion);
        } catch (err) {
          console.error(err);
        }
      });
    },

    addRegion(highlightData) {
      const states = self.getAvailableStates();
      if (states.length === 0) return;

      const control = states[0];
      const values = control.selectedValues();
      const labels = { [control.valueType]: values };
      // Create the region data
      const id = guidGenerator();
      const areaValue = {
        id,
        object: self,
        type: "pdfregion",
        origin: "manual",
        position: highlightData.position,
        ...highlightData.position,
        text: highlightData.content.text,
        classification: false
      };

      const result = self.annotation.createResult(
        areaValue,
        labels,
        control,
        self
      );

      if (result) {
        const newRegion = {
          _id: id,
          type: "pdfregion",
          object: self,
          position: highlightData.position,
          content: highlightData.content,
          label: values[0],
          text: highlightData.content.text
        };

        self.regions.push(newRegion);
        self.annotation.addRegion(newRegion);
        result.area = newRegion;
      }

      return result;
    },

    /**
     * Delete region
     * @param {Region} region
     */
    deleteRegion(id) {
      self.regions = self.regions.filter(r => r._id !== id);
    },

    afterCreate() {}
  }));

const PDFModel = types.compose(
  "PDFModel",
  ProcessAttrsMixin,
  ObjectBase,
  RegionsMixin,
  AnnotationMixin,
  IsReadyMixin,
  TagAttrs,
  Model
);

const PDFRegionModel = types.compose(
  "PDFRegionModel",
  RegionsMixin,
  AreaMixin,
  NormalizationMixin,
  PDFRegion
);

const HighlightComponent = observer(({ highlight, item, onHighlightClick }) => {
  const { label } = highlight;

  useLayoutEffect(() => {
    const states = item.states()?.[0]?.children;
    const region = item.regs.find(x => x.id === highlight._id);
    const state = states?.find(s => s.value === label);
    const color = region?.selected
      ? state?.background ?? "#000000"
      : state?.background + "26" ?? "#00000026";

    const highlightElement = document.querySelector(
      `[data-highlight-id="${highlight._id}"]`
    );

    if (highlightElement) {
      const parts = highlightElement.querySelectorAll(".Highlight__part");
      parts.forEach(part => {
        if (part instanceof HTMLElement) {
          part.onclick = ev => {
            const region = item.regs.find(x => x.id === highlight._id);
            if (region && !region.hidden) region.onClickRegion(ev);
          };
          if (!region.hidden) part.style.background = color;
        }
      });
    }
  }, [highlight]);

  return (
    <div data-highlight-id={highlight._id}>
      <Highlight
        key={highlight._id}
        position={highlight.position}
        onClick={onHighlightClick}
        isScrolledTo={highlight.isScrolledTo}
      />
    </div>
  );
});

const HtxPDFRegionView = inject("store")(
  observer(({ store, item }) => {
    const containerRef = useRef(null);
    const clearSelection = () => {
      if (window.getSelection) {
        window.getSelection().removeAllRanges();
      } else if (document.selection) {
        document.selection.empty();
      }
    };

    const renderHighlight = (
      highlight,
      index,
      setTip,
      hideTip,
      viewportToScaled,
      screenshot,
      isScrolledTo
    ) => {
      return (
        <HighlightComponent
          highlight={{ ...highlight, isScrolledTo }}
          item={item}
          onHighlightClick={() => {
            item.setHighlight(highlight);
            const result = item.annotation.results.find(
              r => r.area.id === highlight.id
            );
            if (result) {
              item.annotation.selectArea(result);
            }
          }}
        />
      );
    };
    item.regions.toJSON();
    return (
      <ObjectTag item={item}>
        {item.errors?.map((error, i) => (
          <ErrorMessage key={`err-${i}`} error={error} />
        ))}
        <div
          ref={containerRef}
          style={{
            position: "relative",
            width: "100%",
            height: "800px",
            overflow: "hidden",
            border: "1px solid #e0e0e0",
            borderRadius: "4px",
            backgroundColor: "#f5f5f5"
          }}
        >
          <PdfLoader url={item._value} beforeLoad={<div>Loading PDF...</div>}>
            {pdfDocument => (
              <PdfHighlighter
                pdfDocument={pdfDocument}
                enableAreaSelection={item.selectionenabled}
                onSelectionFinished={(
                  position,
                  content,
                  hideTipAndSelection
                ) => {
                  if (!item.hasStates) {
                    console.warn("No labels selected");
                    return;
                  }

                  const result = item.addRegion({ position, content });
                  if (result) {
                    hideTipAndSelection();
                    clearSelection();
                  }
                }}
                highlightTransform={renderHighlight}
                highlights={item.regions.toJSON()}
                scrollRef={() => {}}
              />
            )}
          </PdfLoader>
        </div>
      </ObjectTag>
    );
  })
);

// Register the tag and model
Registry.addTag("pdf", PDFModel, HtxPDFRegionView);
Registry.addObjectType(PDFModel);
Registry.addRegionType(PDFRegionModel, "pdf", () => true);

export { PDFRegionModel, PDFModel, HtxPDFRegionView };
