<script lang="ts">
  import "@svebcomponents/example-component";
</script>

<!-- Svelte & HTML Attributes
Please note that we **have** to set increments as a JavaScript number here for our web component to work.
To understand why, it is important to know how svelte sets values on HTML elements.
In the below example, we set the increments property of the exampleComponent to 5.
When the element is mounted, svelte will first check if it has a property called increments.
If it does, it will forgo setting the value as an attribute, but instead set the property directly on the element.
Like: `exampleComponent['increments'] = 5`. In this case, the new value never touches the HTML attribute of our element.
You might have expected that `<example-component increments="5">` would work since our web component has a converter for the increments attribute that would convert the string "5" to a number.
However, since the increments property of our exampleComponent will be set to the string "5" in "JavaScript land", the converter will never be called.
svelte 5 offers no syntax for explicitly setting attributes yet.
see: https://github.com/sveltejs/svelte/issues/12624 -->
<example-component increments={5}></example-component>
